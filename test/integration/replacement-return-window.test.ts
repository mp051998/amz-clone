import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setCartQty } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { placeOrder } from '@/lib/data/orders';
import { cancelReturn, canStartReturn, getOrderReturns, requestReturn } from '@/lib/data/returns';
import type { Order, OrderReturn } from '@/lib/types';
import { admin, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, pickProduct, type TestUser } from './helpers';

const DAY = 86_400_000;

/** What a call failed with, as `code:detail` (or 'no error'). */
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
  return 'no error';
};

let buyer: TestUser;
let order: Order;
let a: string;
let b: string;
let swap: OrderReturn;

beforeAll(async () => {
  // high in the IN pool, apart from other tests' products
  const [pa, pb] = await Promise.all([pickProduct('IN', 117), pickProduct('IN', 118)]);
  [a, b] = [pa.id, pb.id];
  buyer = await newUser('Replacement Window Buyer');
  await setCartQty(buyer.db, 'IN', a, 2);
  await setCartQty(buyer.db, 'IN', b, 1);
  order = await placeOrder(buyer.db, 'IN', { paymentMethod: 'amazonpay', shipping: IN_SHIPPING });
  await deliveredDaysAgo(order.id, 5);
});

afterAll(async () => {
  await deleteUser(buyer);
});

/** Moves the replacement's delivery to `daysAgo` (it shipped the day before). */
async function replacementDeliveredDaysAgo(returnId: string, daysAgo: number) {
  const at = Date.now() - daysAgo * DAY;
  const { error } = await admin()
    .from('returns')
    .update({ replacement_shipped_at: new Date(at - DAY).toISOString(), replacement_delivered_at: new Date(at).toISOString() })
    .eq('id', returnId);
  if (error) throw error;
}

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

describe('a replacement’s own return window', () => {
  it('changes nothing while the replacement is on its way', async () => {
    swap = await requestReturn(buyer.db, order.id, { items: [{ productId: a, qty: 1 }], reason: 'damaged', resolution: 'replacement' });
    const r = (await getOrderReturns(buyer.db, order.id))!;
    expect(days(r.returnByItem[b], r.returnByItem[a])).toBe(0);
    expect(days(r.returnBy!, r.returnByItem[a])).toBe(0);
    expect(r.returnable).toEqual({ [a]: 2, [b]: 1 });
  });

  it('runs from the replacement’s delivery once it arrives', async () => {
    await replacementDeliveredDaysAgo(swap.id, 2); // the order arrived 5 days ago
    const r = (await getOrderReturns(buyer.db, order.id))!;
    expect(days(r.returnByItem[b], r.returnByItem[a])).toBe(3);
    expect(r.returnBy).toBe(r.returnByItem[a]);
    // inside the order's own window everything can still go back, and be swapped once
    expect(r.returnable).toEqual({ [a]: 2, [b]: 1 });
    expect(r.replaceable).toEqual({ [a]: 1, [b]: 1 });
  });

  it('after the order’s window, only the replacement can go back, for a refund', async () => {
    await deliveredDaysAgo(order.id, 12); // India: 10 days; the replacement arrived 2 days ago
    const r = (await getOrderReturns(buyer.db, order.id))!;
    expect(r.returnable).toEqual({ [a]: 1, [b]: 0 });
    expect(r.replaceable).toEqual({ [a]: 0, [b]: 0 });
    expect(canStartReturn(r)).toBe(true);
    expect(Date.parse(r.returnBy!)).toBeGreaterThan(Date.now());

    expect(await failure(requestReturn(buyer.db, order.id, { items: [{ productId: b, qty: 1 }], reason: 'defective' }))).toBe('return_not_allowed:window_closed');
    expect(await failure(requestReturn(buyer.db, order.id, { items: [{ productId: a, qty: 2 }], reason: 'defective' }))).toBe('return_not_allowed:window_closed');
    expect(await failure(requestReturn(buyer.db, order.id, { items: [{ productId: a, qty: 1 }], reason: 'defective', resolution: 'replacement' }))).toBe(
      'replacement_unavailable:already_replaced',
    );

    const back = await requestReturn(buyer.db, order.id, { items: [{ productId: a, qty: 1 }], reason: 'defective' });
    const line = order.items.find((it) => it.productId === a)!;
    expect(back).toMatchObject({ status: 'requested', resolution: 'refund', itemsMinor: line.unitPriceMinor - (line.unitDiscountMinor ?? 0) });

    // the replacement's on its way back; the original units' window has closed
    const after = (await getOrderReturns(buyer.db, order.id))!;
    expect(after.returnable).toEqual({ [a]: 0, [b]: 0 });
    expect(canStartReturn(after)).toBe(false);
    expect(Date.parse(after.returnBy!)).toBeLessThan(Date.now());
    expect(await failure(requestReturn(buyer.db, order.id, { items: [{ productId: a, qty: 1 }], reason: 'defective' }))).toBe('return_not_allowed:window_closed');

    await cancelReturn(buyer.db, back.id);
    expect((await getOrderReturns(buyer.db, order.id))!.returnable).toEqual({ [a]: 1, [b]: 0 });
  });

  it('closes for good once the replacement’s window has passed too', async () => {
    await replacementDeliveredDaysAgo(swap.id, 11);
    const r = (await getOrderReturns(buyer.db, order.id))!;
    expect(r.returnable).toEqual({ [a]: 0, [b]: 0 });
    expect(canStartReturn(r)).toBe(false);
    expect(days(r.returnByItem[a], r.returnBy!)).toBe(0);
    expect(Date.parse(r.returnBy!)).toBeLessThan(Date.now());
    expect(await failure(requestReturn(buyer.db, order.id, { items: [{ productId: a, qty: 1 }], reason: 'defective' }))).toBe('return_not_allowed:window_closed');
  });
});
