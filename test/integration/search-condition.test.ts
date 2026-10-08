import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { listCategories, searchCatalog } from '@/lib/data/catalog';
import { buyingChoices } from '@/lib/data/offers';
import { parseQuery as parseWords } from '@/lib/decision/query';
import { rankedSearch } from '@/lib/decision/server';
import { parseQuery } from '@/lib/search';
import { admin, anon, deleteUser, newUser, type TestUser } from './helpers';

const tag = crypto.randomUUID().slice(0, 6);
const input = (n: number, over: Partial<ProductInput> = {}): ProductInput => ({
  title: `Cond${tag} kettle ${n}`,
  brand: 'Boilwell',
  category: 'home-kitchen',
  image: '/products/placeholder.jpg',
  priceMinor: 3000 + n * 100,
  listMinor: null,
  deal: false,
  couponPct: null,
  maxPerCustomer: null,
  sizes: null,
  unit: null,
  qtyDiscount: null,
  releaseAt: null,
  badge: null,
  boughtPastMonth: null,
  seller: 'Boilwell Store',
  shipsFrom: 'Amazon',
  bullets: [],
  description: null,
  details: [],
  // under the stock the other tests pick products by
  stock: 20,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
  ...over,
});

let boss: TestUser;
// a: offered renewed and used; b: none left new, but another seller has it new;
// c: only an offer out of stock and one off sale
const p = { a: '', b: '', c: '' };

const addOffer = (id: string, of: string, condition: string, over: Record<string, unknown> = {}) =>
  admin()
    .from('products')
    .insert({
      id,
      market_id: 'US',
      offer_of: of,
      condition,
      position: 0,
      category_slug: 'home-kitchen',
      title: 'copied from the product',
      image: 'copied',
      price_minor: 2000,
      seller: 'Offer Seller',
      ships_from: 'Offer Seller',
      stock: 3,
      ...over,
    });

const search = (sp: Record<string, string> = {}) => searchCatalog(anon(), 'US', parseQuery({ k: `Cond${tag}`, ...sp }));
const ids = (r: { items: { id: string }[] }) => r.items.map((i) => i.id).sort();

beforeAll(async () => {
  boss = await newUser('Condition Admin');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  p.a = await createProduct(boss.db, 'US', input(1));
  p.b = await createProduct(boss.db, 'US', input(2, { stock: 0 }));
  p.c = await createProduct(boss.db, 'US', input(3));
  for (const res of [
    await addOffer(`${p.a}-r`, p.a, 'renewed', { price_minor: 2500 }),
    await addOffer(`${p.a}-u`, p.a, 'used_good', { price_minor: 1900 }),
    await addOffer(`${p.b}-n`, p.b, 'new', { price_minor: 3150 }),
    await addOffer(`${p.c}-u`, p.c, 'used_like_new', { stock: 0 }),
    await addOffer(`${p.c}-r`, p.c, 'renewed', { archived_at: new Date().toISOString() }),
  ])
    if (res.error) throw res.error;
});

afterAll(async () => {
  for (const id of [p.a, p.b, p.c]) if (id) await admin().from('products').delete().eq('id', id);
  await deleteUser(boss);
});

describe('search by condition', () => {
  it('counts what can be bought new, renewed and used', async () => {
    const r = await search();
    expect(ids(r)).toEqual([p.a, p.c].sort());
    expect(r.conditionCounts).toEqual({ new: 2, renewed: 1, used: 1 });
    // out of stock included: b can still be bought new from another seller
    expect((await search({ oos: '1' })).conditionCounts).toEqual({ new: 3, renewed: 1, used: 1 });
  });

  it('keeps only what can be bought that way', async () => {
    expect(ids(await search({ condition: 'renewed' }))).toEqual([p.a]);
    expect(ids(await search({ condition: 'used' }))).toEqual([p.a]);
    expect(ids(await search({ condition: 'new' }))).toEqual([p.a, p.c].sort());
    expect(ids(await search({ condition: 'new', oos: '1' }))).toEqual([p.a, p.b, p.c].sort());
    // the facets still cover the whole search
    expect((await search({ condition: 'used' })).conditionCounts).toEqual({ new: 2, renewed: 1, used: 1 });
  });

  it('filters the storefront’s ranked search too', async () => {
    const q = parseWords('US', `Cond${tag}`, await listCategories(anon(), 'US'));
    const res = await rankedSearch('US', q, null, null, { condition: 'used' }, anon());
    expect(res.items.map((r) => r.product.id)).toEqual([p.a]);
  });

  it('sums up other sellers’ offers on sale and in stock as More Buying Choices', async () => {
    const choices = await buyingChoices(anon(), [p.a, p.b, p.c]);
    expect(choices.get(p.a)).toEqual({
      count: 2,
      fromMinor: 1900,
      kinds: [
        { kind: 'renewed', count: 1, fromMinor: 2500 },
        { kind: 'used', count: 1, fromMinor: 1900 },
      ],
    });
    expect(choices.get(p.b)).toMatchObject({ count: 1, fromMinor: 3150 });
    expect(choices.has(p.c)).toBe(false);
  });
});
