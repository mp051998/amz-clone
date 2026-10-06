import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getProduct } from '@/lib/data/catalog';
import { setCartQty } from '@/lib/data/cart';
import { cancelOrder, placeOrder } from '@/lib/data/orders';
import { boughtTogether } from '@/lib/decision/server';
import { admin, anon, deleteUser, newUser, setStock, stockOf, US_SHIPPING, type TestUser } from './helpers';

const shoppers: TestUser[] = [];
let a: string, b: string, c: string, d: string;

/** One unit of each product, ordered (by gift card) by `u`. */
async function buy(u: TestUser, ids: string[]) {
  await u.db.rpc('cart_clear', { p_market: 'US' });
  for (const id of ids) await setCartQty(u.db, 'US', id, 1);
  return placeOrder(u.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
}

/** Four in-stock US products outside any variant group, clear of the other tests' picks. */
async function pickFour(): Promise<string[]> {
  const { data, error } = await admin()
    .from('products')
    .select('id')
    .eq('market_id', 'US')
    .gte('stock', 25)
    .is('variant_group', null)
    .is('archived_at', null)
    .order('id')
    .range(40, 43);
  if (error || data.length < 4) throw error ?? new Error('not enough products');
  return data.map((r) => r.id);
}

const together = async (id: string) => {
  const { data, error } = await anon().rpc('bought_together', { p_product_id: id });
  if (error) throw error;
  return data as { id: string; shoppers: number }[];
};

beforeAll(async () => {
  shoppers.push(...(await Promise.all([newUser('FBT One'), newUser('FBT Two'), newUser('FBT Three')])));
  [a, b, c, d] = await pickFour();
  const [one, two, three] = shoppers;
  await buy(one, [a, b, c]);
  await buy(one, [a, c]); // the same shopper twice still counts once
  await buy(two, [a, b, d]);
  const gone = await buy(three, [a, d]);
  await cancelOrder(three.db, gone.id); // cancelled orders don't count
}, 120_000);

afterAll(async () => {
  await Promise.all(shoppers.map((u) => deleteUser(u)));
});

describe('bought together', () => {
  it('pairs products bought together by at least two shoppers', async () => {
    expect(await together(a)).toEqual([{ id: b, shoppers: 2 }]);
    expect(await together(b)).toEqual([{ id: a, shoppers: 2 }]);
    expect(await together(c)).toEqual([]); // one shopper, two orders
    expect(await together(d)).toEqual([]); // one placed, one cancelled
    expect(await together('nope')).toEqual([]);
  });

  it('leaves out sold-out products and other stores', async () => {
    const stock = await stockOf(b);
    await setStock(b, 0);
    try {
      expect(await together(a)).toEqual([]);
    } finally {
      await setStock(b, stock);
    }
  });

  it('leads with the order pairs and tops up with accessories', async () => {
    const product = (await getProduct(anon(), a))!;
    const items = await boughtTogether(product, 2, anon());
    expect(items[0]).toMatchObject({ source: 'orders', reason: 'Often bought together' });
    expect(items[0].product.id).toBe(b);
    expect(items.length).toBeLessThanOrEqual(2);
    for (const x of items.slice(1)) {
      expect(x.source).toBe('rules');
      expect(x.product.market).toBe('US');
      expect([a, b]).not.toContain(x.product.id);
    }
  });

  it('serves the pick at /products/:id/bought-together', async () => {
    const { GET } = await import('@/app/api/v1/products/[id]/bought-together/route');
    // a bearer token: the cookie client needs a Next request scope
    const token = (await shoppers[0].db.auth.getSession()).data.session!.access_token;
    const call = (id: string, market = 'US') =>
      GET(new NextRequest(`http://localhost/api/v1/products/${id}/bought-together?market=${market}`, { headers: { authorization: `Bearer ${token}` } }), {
        params: Promise.resolve({ id }),
      });
    const res = await call(a);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { product: { id: string }; source: string }[] };
    expect(body.items[0]).toMatchObject({ product: { id: b }, source: 'orders' });
    expect((await call(a, 'IN')).status).toBe(404);
  });

  it('suggests nothing for a product that is off sale', async () => {
    const product = (await getProduct(anon(), a))!;
    expect(await boughtTogether({ ...product, stock: 0 }, 2, anon())).toEqual([]);
    expect(await boughtTogether({ ...product, archived: true }, 2, anon())).toEqual([]);
  });
});
