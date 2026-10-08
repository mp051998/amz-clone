import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/v1/products/[id]/also-bought/route';
import { alsoBought } from '@/lib/data/also-bought';
import { setCartQty } from '@/lib/data/cart';
import { getProduct } from '@/lib/data/catalog';
import { cancelOrder, placeOrder } from '@/lib/data/orders';
import { admin, anon, deleteUser, newUser, setStock, US_SHIPPING, type TestUser } from './helpers';

let one: TestUser, two: TestUser, three: TestUser;
let a: string, b: string, c: string, d: string;

/**
 * This file's own products: other files' orders can't pair with them, and with 24 in stock
 * pickProduct() never picks them. Removed again once the shoppers (and so their orders) are gone.
 */
const ids = ['a', 'b', 'c', 'd'].map((x) => `zz-also-bought-${x}-${crypto.randomUUID().slice(0, 8)}`);

async function buy(u: TestUser, products: string[]) {
  await u.db.rpc('cart_clear', { p_market: 'US' });
  for (const id of products) await setCartQty(u.db, 'US', id, 1);
  return placeOrder(u.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
}

const got = async (id: string) => alsoBought(anon(), (await getProduct(anon(), id))!);

beforeAll(async () => {
  const { data: like, error } = await admin()
    .from('products')
    .select('category_slug, seller, ships_from, image')
    .eq('market_id', 'US')
    .is('variant_group', null)
    .is('archived_at', null)
    .order('id')
    .limit(1)
    .single();
  if (error) throw error;
  const made = await admin()
    .from('products')
    .insert(ids.map((id, i) => ({ id, market_id: 'US', ...like, title: `Also bought test ${i}`, price_minor: 1999, stock: 24, position: 900_000 + i })));
  if (made.error) throw made.error;
  [a, b, c, d] = ids;
  [one, two, three] = await Promise.all([newUser('Bought One'), newUser('Bought Two'), newUser('Bought Three')]);
  // one buys a, b and c in separate orders; two buys a and b together; three buys a, then b and cancels it
  await buy(one, [a]);
  await buy(one, [b]);
  await buy(one, [c]);
  await buy(two, [a, b]);
  await buy(three, [a]);
  await cancelOrder(three.db, (await buy(three, [b, d])).id);
}, 120_000);

afterAll(async () => {
  await Promise.all([deleteUser(one), deleteUser(two), deleteUser(three)]);
  await admin().from('products').delete().in('id', ids);
});

describe('customers who bought this also bought', () => {
  it('counts what a product’s buyers bought in any of their orders, once two of them have', async () => {
    expect((await got(a)).map((p) => p.id)).toEqual([b]);
    expect((await got(b)).map((p) => p.id)).toEqual([a]);
    // only one shopper bought c with anything, and d's order was cancelled
    expect(await got(c)).toEqual([]);
    expect(await got(d)).toEqual([]);
    const { data } = await anon().rpc('also_bought', { p_product_id: a });
    expect(data).toEqual([{ id: b, shoppers: 2 }]);
  });

  it('leaves out products that are sold out', async () => {
    await setStock(b, 0);
    try {
      expect(await got(a)).toEqual([]);
    } finally {
      await setStock(b, 23);
    }
  });

  it('is served by the API, per store', async () => {
    // a bearer token: the cookie client needs a Next request scope
    const token = (await one.db.auth.getSession()).data.session!.access_token;
    const get = (id: string, market: string) =>
      GET(new NextRequest(`http://localhost/api/v1/products/${id}/also-bought?market=${market}`, { headers: { authorization: `Bearer ${token}` } }), {
        params: Promise.resolve({ id }),
      });
    const res = await get(a, 'US');
    expect(res.status).toBe(200);
    expect(((await res.json()).items as { id: string }[]).map((p) => p.id)).toEqual([b]);
    expect((await get(a, 'IN')).status).toBe(404);
    expect((await get('no-such-product', 'US')).status).toBe(404);
  });
});
