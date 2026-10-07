import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setCartQty } from '@/lib/data/cart';
import { adminSales, type SalesReport } from '@/lib/data/admin-sales';
import { DataError } from '@/lib/data/errors';
import { cancelOrder, cancelOrderItems, placeOrder } from '@/lib/data/orders';
import { admin, deleteUser, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

let buyer: TestUser;
let boss: TestUser;
let x: { id: string; price_minor: number };
let y: { id: string; price_minor: number };
let z: { id: string; price_minor: number };
let before: SalesReport;
let after: SalesReport;

/** `buyer` orders `qty` of each product in the US store. */
async function order(lines: [{ id: string }, number][]) {
  await buyer.db.rpc('cart_clear', { p_market: 'US' });
  for (const [p, qty] of lines) await setCartQty(buyer.db, 'US', p.id, qty);
  return placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

beforeAll(async () => {
  [buyer, boss] = await Promise.all([newUser('Sales Buyer'), newUser('Sales Admin')]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  [x, y, z] = await Promise.all([pickProduct('US', 80), pickProduct('US', 81), pickProduct('US', 82)]);
  before = await adminSales(boss.db, 'US', 7);
  // two orders that count: 20 of x with 3 of y, then 5 more of x
  await order([[x, 20], [y, 3]]);
  await order([[x, 5]]);
  // z is cancelled from the first of these, and a whole order of y is cancelled
  const third = await order([[y, 2], [z, 1]]);
  await cancelOrderItems(buyer.db, third.id, [z.id]);
  await cancelOrder(buyer.db, (await order([[y, 4]])).id);
  after = await adminSales(boss.db, 'US', 7);
});

afterAll(async () => {
  await Promise.all([deleteUser(buyer), deleteUser(boss)]);
});

describe('admin sales', () => {
  it('counts placed orders, their units and what they sold for, not cancelled orders or items', () => {
    const units = 20 + 3 + 5 + 2;
    const sales = 25 * x.price_minor + 5 * y.price_minor;
    expect(after.totals.orders - before.totals.orders).toBe(3);
    expect(after.totals.units - before.totals.units).toBe(units);
    expect(after.totals.salesMinor - before.totals.salesMinor).toBe(sales);
    expect(after.totals.cancelledOrders - before.totals.cancelledOrders).toBe(1);
    // today is the last day, and gets all of it
    expect(after.byDay).toHaveLength(7);
    expect(after.byDay.at(-1)!.day).toBe(after.to);
    expect(after.byDay.at(-1)!.salesMinor - (before.byDay.at(-1)?.day === after.to ? before.byDay.at(-1)!.salesMinor : 0)).toBe(sales);
    expect(after.timeZone).toBe('America/Los_Angeles');
  });

  it('ranks the best sellers by units', () => {
    const top = (r: SalesReport, id: string) => r.top.find((p) => p.productId === id);
    expect(top(after, x.id)).toMatchObject({ units: 25 + (top(before, x.id)?.units ?? 0), orders: 2 + (top(before, x.id)?.orders ?? 0) });
    expect(after.top.findIndex((p) => p.productId === x.id)).toBeLessThan(after.top.findIndex((p) => p.productId === y.id));
    expect(top(after, z.id)).toBeUndefined();
  });

  it('is for admins only, over 1 to 365 days', async () => {
    expect(await code(adminSales(buyer.db, 'US', 7))).toBe('forbidden');
    expect(await code(adminSales(boss.db, 'US', 0))).toBe('invalid_input');
    expect(await code(adminSales(boss.db, 'US', 366))).toBe('invalid_input');
    expect((await adminSales(boss.db, 'IN', 1)).byDay).toHaveLength(1);
  });

  it('is served at /admin/sales', async () => {
    const { GET } = await import('@/app/api/v1/admin/sales/route');
    // a bearer token: the cookie client needs a Next request scope
    const call = async (who: TestUser, query: string) => {
      const token = (await who.db.auth.getSession()).data.session!.access_token;
      return GET(new NextRequest(`http://localhost/api/v1/admin/sales?market=US${query}`, { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({}) });
    };
    const res = await call(boss, '&days=7');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { sales: SalesReport }).sales.totals.orders).toBeGreaterThanOrEqual(after.totals.orders);
    expect((await call(boss, '&days=week')).status).toBe(422);
    expect((await call(buyer, '')).status).toBe(403);
  });
});
