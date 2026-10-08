import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setCartQty } from '@/lib/data/cart';
import { buyAgain, lastPurchase } from '@/lib/data/buy-again';
import { cancelOrder, placeOrder } from '@/lib/data/orders';
import type { Market } from '@/lib/types';
import { admin, deleteUser, IN_SHIPPING, newUser, setStock, stockOf, US_SHIPPING, type TestUser } from './helpers';

let me: TestUser, other: TestUser;
let a: string, b: string, c: string, d: string, inProduct: string;
let first: string, second: string;

/** In-stock products outside any variant group, clear of the other tests' picks. */
async function pick(market: Market, from: number, n: number): Promise<string[]> {
  const { data, error } = await admin()
    .from('products')
    .select('id')
    .eq('market_id', market)
    .gte('stock', 25)
    .is('variant_group', null)
    .is('archived_at', null)
    .order('id')
    .range(from, from + n - 1);
  if (error || data.length < n) throw error ?? new Error('not enough products');
  return data.map((r) => r.id);
}

async function buy(u: TestUser, market: Market, ids: string[]) {
  await u.db.rpc('cart_clear', { p_market: market });
  for (const id of ids) await setCartQty(u.db, market, id, 1);
  return market === 'US'
    ? placeOrder(u.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING })
    : placeOrder(u.db, 'IN', { paymentMethod: 'upi', shipping: IN_SHIPPING });
}

const archive = (id: string, at: string | null) => admin().from('products').update({ archived_at: at }).eq('id', id).throwOnError();

beforeAll(async () => {
  [me, other] = await Promise.all([newUser('Again One'), newUser('Again Two')]);
  [a, b, c, d] = await pick('US', 50, 4);
  [inProduct] = await pick('IN', 30, 1);
  first = (await buy(me, 'US', [a, b])).id;
  second = (await buy(me, 'US', [c, a])).id; // the newest order: c and a
  const gone = await buy(me, 'US', [d]);
  await cancelOrder(me.db, gone.id); // a cancelled order isn't something you bought
  await buy(me, 'IN', [inProduct]);
}, 120_000);

afterAll(async () => {
  await Promise.all([deleteUser(me), deleteUser(other)]);
});

describe('buy again', () => {
  it('lists each product bought once, newest first, per store', async () => {
    const items = await buyAgain(me.db, 'US');
    expect(items.map((x) => x.productId)).toEqual([c, a, b]);
    expect(items.find((x) => x.productId === a)).toMatchObject({ orders: 2, availability: 'available', product: { id: a, market: 'US' } });
    expect((await buyAgain(me.db, 'IN')).map((x) => x.productId)).toEqual([inProduct]);
  });

  it('shows nothing of anyone else', async () => {
    expect(await buyAgain(other.db, 'US')).toEqual([]);
  });

  it('moves sold-out and archived products to the end', async () => {
    const stock = await stockOf(c);
    await setStock(c, 0);
    await archive(a, new Date().toISOString());
    try {
      const items = await buyAgain(me.db, 'US');
      expect(items.map((x) => [x.productId, x.availability])).toEqual([
        [b, 'available'],
        [c, 'sold_out'],
        [a, 'gone'],
      ]);
      // an archived product keeps its title and image from the order
      expect(items[2]).toMatchObject({ title: expect.any(String), image: expect.any(String) });
    } finally {
      await setStock(c, stock);
      await archive(a, null);
    }
  });

  it('gives the product page the latest order a product is on, of your own', async () => {
    const last = await lastPurchase(me.db, me.id, a);
    expect(last).toEqual({ orderId: second, at: expect.any(String) });
    expect((await lastPurchase(me.db, me.id, b))?.orderId).toBe(first);
    expect(await lastPurchase(me.db, me.id, d)).toBeNull(); // only on a cancelled order
    expect(await lastPurchase(other.db, other.id, a)).toBeNull();
    expect(await lastPurchase(other.db, me.id, a)).toBeNull(); // someone else's orders aren't readable
  });

  it('serves the list at /orders/buy-again', async () => {
    const { GET } = await import('@/app/api/v1/orders/buy-again/route');
    const token = (await me.db.auth.getSession()).data.session!.access_token;
    // a bearer token: the cookie client needs a Next request scope
    const req = new NextRequest('http://localhost/api/v1/orders/buy-again?market=US&limit=2', { headers: { authorization: `Bearer ${token}` } });
    const res = await GET(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { productId: string }[] };
    expect(body.items.map((x) => x.productId)).toEqual([c, a]);
  });
});
