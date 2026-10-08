import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/v1/recommendations/route';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { recordView } from '@/lib/data/also-viewed';
import { addToCart } from '@/lib/data/cart';
import { placeOrder } from '@/lib/data/orders';
import { admin, anon, deleteUser, newUser, US_SHIPPING, type TestUser } from './helpers';

const tag = crypto.randomUUID().slice(0, 6);
const input = (name: string): ProductInput => ({
  title: `Recs${tag} ${name}`,
  brand: 'Recs',
  category: 'home-kitchen',
  image: '/products/placeholder.jpg',
  priceMinor: 1500,
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
  seller: 'Recs Store',
  shipsFrom: 'Store',
  bullets: [],
  description: null,
  details: [],
  // under the stock the other tests pick products by
  stock: 20,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
});

let boss: TestUser;
let buyer: TestUser;
const ids: Record<'kettle' | 'mug' | 'teapot' | 'lamp' | 'bulb', string> = { kettle: '', mug: '', teapot: '', lamp: '', bulb: '' };

type Groups = { groups: { reason: string; anchor: { id: string }; items: { id: string }[] }[] };
const recs = async (query: string, user?: TestUser): Promise<[string, string, string[]][]> => {
  const headers: Record<string, string> = {};
  if (user) headers.authorization = `Bearer ${(await user.db.auth.getSession()).data.session!.access_token}`;
  const res = await GET(new NextRequest(`http://localhost/api/v1/recommendations?market=US&${query}`, { headers }), { params: Promise.resolve({}) });
  expect(res.status).toBe(200);
  const body = (await res.json()) as Groups;
  return body.groups.map((g) => [g.reason, g.anchor.id, g.items.map((p) => p.id).sort()]);
};

beforeAll(async () => {
  boss = await newUser('Recs Admin');
  buyer = await newUser('Recs Buyer');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  for (const name of Object.keys(ids) as (keyof typeof ids)[]) ids[name] = await createProduct(boss.db, 'US', input(name));
  // viewed together: the kettle with the mug and the teapot, the lamp with the bulb
  await recordView(anon(), ids.mug, [ids.kettle]);
  await recordView(anon(), ids.teapot, [ids.kettle]);
  await recordView(anon(), ids.bulb, [ids.lamp]);
});

afterAll(async () => {
  await deleteUser(buyer);
  for (const id of Object.values(ids)) if (id) await admin().from('products').delete().eq('id', id);
  await deleteUser(boss);
});

describe('Your Recommendations', () => {
  it('has a row for each product viewed lately, of what was viewed with it', async () => {
    expect(await recs(`recent=${ids.kettle},${ids.lamp}`)).toEqual([
      ['viewed', ids.kettle, [ids.mug, ids.teapot].sort()],
      ['viewed', ids.lamp, [ids.bulb]],
    ]);
    // a product viewed is never recommended from another
    expect(await recs(`recent=${ids.kettle},${ids.mug}`)).toEqual([['viewed', ids.kettle, [ids.teapot]]]);
  });

  it('leaves out the products asked not to be used, and ignores what isn’t an id', async () => {
    expect(await recs(`recent=${ids.kettle},${ids.lamp}&skip=${ids.kettle}`)).toEqual([['viewed', ids.lamp, [ids.bulb]]]);
    expect(await recs(`recent=bad id,${ids.lamp}&skip=<x>`)).toEqual([['viewed', ids.lamp, [ids.bulb]]]);
    expect(await recs('')).toEqual([]);
  });

  it('doesn’t recommend what the caller already bought', async () => {
    await addToCart(buyer.db, 'US', ids.bulb, 1);
    await placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
    expect(await recs(`recent=${ids.lamp}`, buyer)).toEqual([]);
    expect(await recs(`recent=${ids.lamp}`)).toEqual([['viewed', ids.lamp, [ids.bulb]]]);
  });
});
