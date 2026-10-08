import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { getProduct, searchCatalog } from '@/lib/data/catalog';
import {
  addSmallBusiness,
  getSmallBusiness,
  listSmallBusinesses,
  removeSmallBusiness,
  updateSmallBusiness,
} from '@/lib/data/small-businesses';
import { parseQuery } from '@/lib/search';
import { admin, anon, deleteUser, newUser, type TestUser } from './helpers';

const tag = crypto.randomUUID().slice(0, 6);
const word = `Smallbiz${tag}`;
const brand = `Hollow Oak ${tag}`;
const input = (over: Partial<ProductInput> = {}): ProductInput => ({
  title: `${word} hand-thrown mug`,
  brand,
  category: 'home-kitchen',
  image: '/products/placeholder.jpg',
  priceMinor: 1800,
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
  seller: 'Hollow Oak',
  shipsFrom: 'Hollow Oak',
  bullets: ['Stoneware'],
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
let shopper: TestUser;
let mug: string;
let other: string;
const offer = () => `${mug}-o1`;

beforeAll(async () => {
  boss = await newUser('Small Business Admin');
  shopper = await newUser('Small Business Shopper');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  mug = await createProduct(boss.db, 'US', input());
  other = await createProduct(boss.db, 'US', input({ title: `${word} factory mug`, brand: `Bigco ${tag}` }));
  // another seller's offer on it (sellers have no app of their own yet)
  const res = await admin().from('products').insert({
    id: offer(),
    market_id: 'US',
    offer_of: mug,
    position: 0,
    category_slug: 'home-kitchen',
    title: 'copied from the product',
    image: 'copied',
    price_minor: 1600,
    seller: 'Offer Seller',
    ships_from: 'Offer Seller',
    stock: 3,
    condition: 'used_good',
  });
  if (res.error) throw res.error;
});

afterAll(async () => {
  await admin().from('small_businesses').delete().eq('market_id', 'US').eq('brand', brand);
  if (mug) await admin().from('products').delete().eq('id', offer());
  for (const id of [mug, other]) if (id) await admin().from('products').delete().eq('id', id);
  await deleteUser(boss);
  await deleteUser(shopper);
});

describe('Small Business', () => {
  it('lists each store’s seeded small businesses, and finds and counts their products in search', async () => {
    const us = await listSmallBusinesses(anon(), 'US');
    const india = await listSmallBusinesses(anon(), 'IN');
    expect(us.map((b) => b.brand)).toContain('Flycatcher');
    expect(india.map((b) => b.brand)).toContain('Smartivity');
    expect(us.map((b) => b.brand)).not.toContain('Smartivity');
    expect(us.every((b) => b.story.length > 0)).toBe(true);

    const res = await searchCatalog(anon(), 'US', parseQuery({ small: '1' }));
    expect(res.total).toBeGreaterThan(0);
    expect(res.items.every((p) => p.smallBusiness)).toBe(true);
    expect(res.items.every((p) => us.some((b) => b.brand === p.brand))).toBe(true);
    expect(res.smallBusinessCount).toBe(res.groups);
  });

  it('badges a brand’s products, and an offer of one, once an admin marks it', async () => {
    expect((await getProduct(anon(), mug))?.smallBusiness).toBeUndefined();
    expect((await searchCatalog(anon(), 'US', parseQuery({ k: word }))).smallBusinessCount).toBe(0);

    const added = await addSmallBusiness(boss.db, 'US', { brand: ` ${brand} `, story: '  Mugs and bowls,\n thrown by hand.  ' });
    expect(added).toEqual({ brand, story: 'Mugs and bowls, thrown by hand.' });

    expect((await getProduct(anon(), mug))?.smallBusiness).toBe(true);
    expect((await getProduct(anon(), offer()))?.smallBusiness).toBe(true);
    expect((await getProduct(anon(), other))?.smallBusiness).toBeUndefined();

    const all = await searchCatalog(anon(), 'US', parseQuery({ k: word }));
    expect(all.items.map((p) => p.id).sort()).toEqual([mug, other].sort());
    expect(all.smallBusinessCount).toBe(1);
    const small = await searchCatalog(anon(), 'US', parseQuery({ k: word, small: '1' }));
    expect(small.items.map((p) => p.id)).toEqual([mug]);
    // the count is over the whole search, not the filtered one
    expect(small.smallBusinessCount).toBe(1);
  });

  it('refuses a brand twice, and brands the store doesn’t sell', async () => {
    await expect(addSmallBusiness(boss.db, 'US', { brand, story: 'Again.' })).rejects.toMatchObject({ code: 'small_business_exists' });
    await expect(addSmallBusiness(boss.db, 'US', { brand: `Nobody ${tag}`, story: 'Nothing.' })).rejects.toMatchObject({ code: 'invalid_input', detail: 'brand' });
    // sold in the US store, not India's
    await expect(addSmallBusiness(boss.db, 'IN', { brand, story: 'Mugs.' })).rejects.toMatchObject({ code: 'invalid_input', detail: 'brand' });
    await expect(addSmallBusiness(boss.db, 'US', { brand: `Bigco ${tag}`, story: '' })).rejects.toMatchObject({ code: 'invalid_input', detail: 'story' });
  });

  it('changes what its products say', async () => {
    await updateSmallBusiness(boss.db, 'US', brand, 'Mugs, bowls and vases.');
    expect(await getSmallBusiness(anon(), 'US', brand)).toEqual({ brand, story: 'Mugs, bowls and vases.' });
    expect(await getSmallBusiness(anon(), 'IN', brand)).toBeNull();
    await expect(updateSmallBusiness(boss.db, 'IN', brand, 'Mugs.')).rejects.toMatchObject({ code: 'small_business_not_found' });
  });

  it('can’t be changed by shoppers', async () => {
    for (const db of [anon(), shopper.db]) {
      const ins = await db.from('small_businesses').insert({ market_id: 'US', brand: `Bigco ${tag}`, story: 'Sneaky.' });
      expect(ins.error).not.toBeNull();
      const upd = await db.from('small_businesses').update({ story: 'Sneaky.' }).eq('brand', brand).select('brand');
      expect(upd.data ?? []).toEqual([]);
      const del = await db.from('small_businesses').delete().eq('brand', brand).select('brand');
      expect(del.data ?? []).toEqual([]);
    }
    expect((await getSmallBusiness(anon(), 'US', brand))?.story).toBe('Mugs, bowls and vases.');
    expect((await getProduct(anon(), other))?.smallBusiness).toBeUndefined();
  });

  it('takes the badge off once removed', async () => {
    await removeSmallBusiness(boss.db, 'US', brand);
    expect((await getProduct(anon(), mug))?.smallBusiness).toBeUndefined();
    expect((await searchCatalog(anon(), 'US', parseQuery({ k: word, small: '1' }))).total).toBe(0);
    await expect(removeSmallBusiness(boss.db, 'US', brand)).rejects.toMatchObject({ code: 'small_business_not_found' });
  });
});
