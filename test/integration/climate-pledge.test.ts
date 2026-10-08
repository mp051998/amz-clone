import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, getAdminProduct, updateProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { getProduct, searchCatalog } from '@/lib/data/catalog';
import { parseQuery } from '@/lib/search';
import { admin, anon, deleteUser, newUser, type TestUser } from './helpers';

const tag = crypto.randomUUID().slice(0, 6);
const word = `Climate${tag}`;
const input = (over: Partial<ProductInput> = {}): ProductInput => ({
  title: `${word} bamboo cutting board`,
  brand: 'Grove',
  category: 'home-kitchen',
  image: '/products/placeholder.jpg',
  priceMinor: 2500,
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
  seller: 'Grove Store',
  shipsFrom: 'Amazon',
  bullets: ['End-grain bamboo'],
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
let board: string;
let plain: string;
const offer = () => `${board}-o1`;

beforeAll(async () => {
  boss = await newUser('Climate Admin');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  board = await createProduct(boss.db, 'US', input({ climate: ['recycled', 'forest', 'recycled'] }));
  plain = await createProduct(boss.db, 'US', input({ title: `${word} plastic cutting board` }));
  // another seller's offer on it (sellers have no app of their own yet)
  const res = await admin().from('products').insert({
    id: offer(),
    market_id: 'US',
    offer_of: board,
    position: 0,
    category_slug: 'home-kitchen',
    title: 'copied from the product',
    image: 'copied',
    price_minor: 2200,
    seller: 'Offer Seller',
    ships_from: 'Offer Seller',
    stock: 3,
    condition: 'used_good',
  });
  if (res.error) throw res.error;
});

afterAll(async () => {
  if (board) await admin().from('products').delete().eq('id', offer());
  for (const id of [board, plain]) if (id) await admin().from('products').delete().eq('id', id);
  await deleteUser(boss);
});

describe('Climate Pledge Friendly', () => {
  it('keeps an admin’s certifications, each once in a fixed order, and shows them on the product and its offers', async () => {
    expect((await getAdminProduct(boss.db, board))?.climate).toEqual(['recycled', 'forest']);
    expect((await getProduct(anon(), board))?.climate).toEqual(['recycled', 'forest']);
    expect((await getAdminProduct(boss.db, plain))?.climate).toEqual([]);
    expect((await getProduct(anon(), plain))?.climate).toBeUndefined();
    // an offer is certified as its product is
    expect((await getProduct(anon(), offer()))?.climate).toEqual(['recycled', 'forest']);
  });

  it('filters search to certified products, and counts them for the filter', async () => {
    const all = await searchCatalog(anon(), 'US', parseQuery({ k: word }));
    expect(all.items.map((p) => p.id).sort()).toEqual([board, plain].sort());
    expect(all.climateCount).toBe(1);

    const certified = await searchCatalog(anon(), 'US', parseQuery({ k: word, climate: '1' }));
    expect(certified.items.map((p) => p.id)).toEqual([board]);
    // the count is over the whole search, not the filtered one
    expect(certified.climateCount).toBe(1);
  });

  it('finds certified products across the seeded catalog', async () => {
    const res = await searchCatalog(anon(), 'US', parseQuery({ climate: '1' }));
    expect(res.total).toBeGreaterThan(0);
    expect(res.items.every((p) => p.climate?.length)).toBe(true);
    expect(res.climateCount).toBe(res.groups);
  });

  it('leaves them as they are on an update without them, and clears them with none', async () => {
    await updateProduct(boss.db, plain, input({ title: `${word} plastic cutting board`, priceMinor: 2400 }));
    expect((await getAdminProduct(boss.db, plain))?.climate).toEqual([]);

    await updateProduct(boss.db, board, input({ priceMinor: 2400 }));
    expect((await getAdminProduct(boss.db, board))?.climate).toEqual(['recycled', 'forest']);

    await updateProduct(boss.db, board, input({ climate: [] }));
    expect((await getProduct(anon(), board))?.climate).toBeUndefined();
    expect((await searchCatalog(anon(), 'US', parseQuery({ k: word, climate: '1' }))).total).toBe(0);

    await updateProduct(boss.db, board, input({ climate: ['carbon'] }));
    expect((await getProduct(anon(), board))?.climate).toEqual(['carbon']);
  });

  it('refuses unknown certifications', async () => {
    await expect(updateProduct(boss.db, board, input({ climate: ['bogus' as never] }))).rejects.toMatchObject({ code: 'invalid_input', detail: 'climate' });
    // and so does the database
    const { error } = await admin().from('products').update({ climate: ['bogus'] }).eq('id', board);
    expect(error?.code).toBe('23514');
    expect((await getProduct(anon(), board))?.climate).toEqual(['carbon']);
  });

  it('can’t be set by shoppers', async () => {
    const { data } = await anon().from('products').update({ climate: [] }).eq('id', board).select('id');
    expect(data ?? []).toEqual([]);
    expect((await getProduct(anon(), board))?.climate).toEqual(['carbon']);
  });
});
