import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boughtPastMonth } from '@/lib/data/bought';
import { placeOrder } from '@/lib/data/orders';
import { admin, anon, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, setStock, stockOf, type TestUser } from './helpers';

let buyer: TestUser;
/** 60 bought this month (20 days ago, before the movers & shakers' fortnight) */
let popular: { id: string };
/** 2 bought this month, as long ago */
let few: { id: string };
/** 60 bought, all over a month ago */
let stale: { id: string };

/** `qty` of a product in one IN order, placed `daysAgo` days ago; its stock is put back after. */
async function sell(productId: string, qty: number, daysAgo = 0) {
  const stock = await stockOf(productId);
  await setStock(productId, stock + qty);
  const order = await placeOrder(buyer.db, 'IN', { paymentMethod: 'amazonpay', shipping: IN_SHIPPING, buyNow: { productId, qty } });
  // delivered daysAgo - 3 days ago is placed daysAgo days ago
  if (daysAgo) await deliveredDaysAgo(order.id, daysAgo - 3);
  await setStock(productId, stock);
}

/**
 * IN products outside pickProduct's pool (it takes those with 25 or more in stock), bought without
 * a size, a per-customer limit or a release date; sell() stocks them up first.
 */
async function quietProducts(n: number): Promise<{ id: string }[]> {
  const { data, error } = await admin()
    .from('products')
    .select('id')
    .eq('market_id', 'IN')
    .gt('stock', 0)
    .lt('stock', 25)
    .is('sizes', null)
    .is('max_per_customer', null)
    .is('release_at', null)
    .is('offer_of', null)
    .is('archived_at', null)
    .eq('condition', 'new')
    // the cheapest, so 60 of one stay well inside a test shopper's balance
    .order('price_minor')
    .order('id')
    .limit(n);
  if (error || !data || data.length < n) throw error ?? new Error('not enough products');
  return data;
}

beforeAll(async () => {
  [buyer, [popular, few, stale]] = await Promise.all([newUser('Bought Buyer'), quietProducts(3)]);
  // two orders of the most a line takes
  await sell(popular.id, 30, 20);
  await sell(popular.id, 30, 20);
  await sell(few.id, 2, 20);
  await sell(stale.id, 30, 40);
  await sell(stale.id, 30, 40);
});

afterAll(async () => {
  await deleteUser(buyer);
});

describe('bought in past month', () => {
  it('counts the units bought in the last 30 days, and only past Amazon’s floor of 50', async () => {
    const { data, error } = await anon().rpc('bought_past_month', { p_ids: [popular.id, few.id, stale.id] });
    expect(error).toBeNull();
    const units = data as Record<string, number>;
    expect(units[popular.id]).toBeGreaterThanOrEqual(60);
    // a couple of sales never leaves the database, nor does last month's
    expect(Object.keys(units)).toEqual([popular.id]);
  });

  it('labels them as Amazon does', async () => {
    const labels = await boughtPastMonth(anon(), [popular.id, few.id, stale.id]);
    expect(labels.get(popular.id)).toMatch(/^(50|\d00|\dK)\+ bought in past month$/);
    expect(labels.has(few.id)).toBe(false);
    expect(labels.has(stale.id)).toBe(false);
    expect((await boughtPastMonth(anon(), [])).size).toBe(0);
  });
});
