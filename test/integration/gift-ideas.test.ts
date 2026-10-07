import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setCartQty } from '@/lib/data/cart';
import { giftIdeas } from '@/lib/data/catalog';
import { addItem, ensureDefaultCollection, markSharedGift, shareCollection } from '@/lib/data/collections';
import { cancelOrder, placeOrder } from '@/lib/data/orders';
import { admin, anon, deleteUser, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

let a: TestUser;
let b: TestUser;
let c: TestUser;
let x: { id: string };
let y: { id: string };
let z: { id: string };
let category: string;

/** `who` orders one each of `products` in the US store, as a gift or not. */
async function order(who: TestUser, products: { id: string }[], gift: boolean) {
  await who.db.rpc('cart_clear', { p_market: 'US' });
  for (const p of products) await setCartQty(who.db, 'US', p.id, 1);
  return placeOrder(who.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, ...(gift ? { gift: { message: 'Happy birthday!' } } : {}) });
}

beforeAll(async () => {
  [a, b, c] = await Promise.all([newUser('Giver A'), newUser('Giver B'), newUser('Giver C')]);
  [x, y, z] = await Promise.all([pickProduct('US', 77), pickProduct('US', 78), pickProduct('US', 79)]);
  // y: given by three shoppers. x: by two, one of them off a shared list
  await order(a, [y, x], true);
  await order(b, [y], true);
  await order(c, [y], true);
  const list = await ensureDefaultCollection(c.db, 'US');
  await addItem(c.db, list.id, x.id);
  const { token } = await shareCollection(c.db, list.id);
  await markSharedGift(b.db, token, x.id, true);
  // z: bought for themselves, and given in an order that was then cancelled
  await order(a, [z], false);
  await cancelOrder(b.db, (await order(b, [z], true)).id);
  const { data } = await admin().from('products').select('category_slug').eq('id', y.id).single();
  category = data!.category_slug;
});

afterAll(async () => {
  await Promise.all([deleteUser(a), deleteUser(b), deleteUser(c)]);
});

describe('gift ideas', () => {
  it('ranks by shoppers who gave it lately, from gift orders and shared lists; not their own buys or cancelled gifts', async () => {
    const { data, error } = await anon().rpc('gift_ideas', { p_market: 'US', p_limit: 100 });
    expect(error).toBeNull();
    const ids = data!;
    expect(ids).toContain(x.id);
    expect(ids.indexOf(y.id)).toBeLessThan(ids.indexOf(x.id));
    expect(ids).not.toContain(z.id);
    // the other store's chart doesn't see these orders
    expect((await anon().rpc('gift_ideas', { p_market: 'IN', p_limit: 100 })).data).not.toContain(y.id);
  });

  it('the chart puts given products first, by department, and fills up with bestsellers', async () => {
    const chart = await giftIdeas(anon(), 'US', { category, limit: 40 });
    expect(chart[0]?.id).toBe(y.id);
    expect(chart.every((p) => p.category === category)).toBe(true);
    expect(new Set(chart.map((p) => p.id)).size).toBe(chart.length);
    expect(chart.length).toBeGreaterThan(1);
  });

  it('serves every chart at /charts/:chart', async () => {
    const { GET } = await import('@/app/api/v1/charts/[chart]/route');
    // a bearer token: the cookie client needs a Next request scope
    const token = (await a.db.auth.getSession()).data.session!.access_token;
    const call = (chart: string, query = '') =>
      GET(new NextRequest(`http://localhost/api/v1/charts/${chart}?market=US${query}`, { headers: { authorization: `Bearer ${token}` } }), {
        params: Promise.resolve({ chart }),
      });
    const res = await call('gift-ideas', `&dept=${category}&limit=5`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { chart: string; dept: string; items: { id: string }[] };
    expect(body).toMatchObject({ chart: 'gift-ideas', dept: category });
    expect(body.items[0].id).toBe(y.id);
    expect(body.items.length).toBeLessThanOrEqual(5);
    for (const chart of ['bestsellers', 'new-releases', 'most-wished-for']) {
      const r = await call(chart, '&limit=3');
      expect(r.status).toBe(200);
      expect(((await r.json()) as { items: unknown[] }).items).toHaveLength(3);
    }
    expect((await call('hot-new-things')).status).toBe(404);
    expect((await call('bestsellers', '&dept=no-such-department')).status).toBe(404);
    expect((await call('bestsellers', '&limit=0')).status).toBe(422);
  });
});
