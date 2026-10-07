import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { storeBalance } from '@/lib/data/balance';
import { DataError } from '@/lib/data/errors';
import { reportNotReceived } from '@/lib/data/not-received';
import { placeOrder } from '@/lib/data/orders';
import { getOrderReturns, requestReturn } from '@/lib/data/returns';
import { deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, pickProduct, setStock, stockOf, US_SHIPPING, type TestUser } from './helpers';

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
let other: TestUser;
let us: { id: string };
let inProduct: { id: string };

beforeAll(async () => {
  [buyer, other, us, inProduct] = await Promise.all([newUser('Missing Package Buyer'), newUser('Missing Package Other'), pickProduct('US', 100), pickProduct('IN', 100)]);
});

afterAll(async () => {
  await Promise.all([deleteUser(buyer), deleteUser(other)]);
});

const buy = (qty = 1) => placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, buyNow: { productId: us.id, qty } });

describe('reporting a package that didn’t arrive', () => {
  it('refunds the whole order to the balance once it’s marked delivered, and only once', async () => {
    const order = await buy(2);
    expect(await failure(reportNotReceived(buyer.db, order.id))).toBe('return_not_allowed:not_delivered');
    await deliveredDaysAgo(order.id, 1);
    expect(await failure(reportNotReceived(other.db, order.id))).toBe('order_not_found:');

    const before = await storeBalance(buyer.db, 'US');
    const r = await reportNotReceived(buyer.db, order.id);
    expect(r).toMatchObject({ reason: 'not_received', resolution: 'refund', status: 'received', refund: { status: 'succeeded' } });
    expect(r.refundMinor).toBe(order.totals.totalMinor);
    expect(r.items).toEqual([expect.objectContaining({ productId: us.id, qty: 2 })]);
    expect(await storeBalance(buyer.db, 'US')).toBe((before ?? 0) + order.totals.totalMinor);

    expect(await failure(reportNotReceived(buyer.db, order.id))).toBe('return_not_allowed:returned');
    expect(await failure(requestReturn(buyer.db, order.id, { items: [{ productId: us.id, qty: 1 }], reason: 'damaged' }))).toBe('invalid_input:items');
    expect((await getOrderReturns(buyer.db, order.id))?.returns).toHaveLength(1);
  });

  it('not once 30 days have passed since delivery', async () => {
    const order = await buy();
    await deliveredDaysAgo(order.id, 31);
    expect(await failure(reportNotReceived(buyer.db, order.id))).toBe('return_not_allowed:window_closed');
  });

  it('not after something from the order has been sent back', async () => {
    const order = await buy(2);
    await deliveredDaysAgo(order.id, 2);
    await requestReturn(buyer.db, order.id, { items: [{ productId: us.id, qty: 1 }], reason: 'no_longer_needed' });
    expect(await failure(reportNotReceived(buyer.db, order.id))).toBe('return_not_allowed:returned');
  });

  it('not for cash on delivery, which was only paid if it arrived', async () => {
    const order = await placeOrder(buyer.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId: inProduct.id, qty: 1 } });
    await deliveredDaysAgo(order.id, 1);
    expect(await failure(reportNotReceived(buyer.db, order.id))).toBe('return_not_allowed:cash_on_delivery');
  });
});

describe('sending a missing package again', () => {
  let item: { id: string };
  const buyIn = (qty = 1) => placeOrder(buyer.db, 'IN', { paymentMethod: 'giftcard', shipping: IN_SHIPPING, buyNow: { productId: item.id, qty } });

  beforeAll(async () => {
    // high in the pool: running it out of stock below can't move another test's product
    item = await pickProduct('IN', 110);
  });

  it('ships every item again at no charge, out of stock now, with nothing to send back', async () => {
    const order = await buyIn(2);
    await deliveredDaysAgo(order.id, 1);
    expect(await failure(reportNotReceived(buyer.db, order.id, 'exchange'))).toBe('invalid_input:resolution');
    const stock = await stockOf(item.id);
    const balance = await storeBalance(buyer.db, 'IN');

    const r = await reportNotReceived(buyer.db, order.id, 'replacement');
    expect(r).toMatchObject({ reason: 'not_received', resolution: 'replacement', status: 'received', refundMinor: 0 });
    expect(r.items).toEqual([expect.objectContaining({ productId: item.id, qty: 2 })]);
    expect(Date.parse(r.replacement!.shippedAt)).toBeGreaterThan(Date.now());
    expect(Date.parse(r.replacement!.deliveredAt)).toBeGreaterThan(Date.parse(r.replacement!.shippedAt));
    expect(await stockOf(item.id)).toBe(stock - 2);
    expect(await storeBalance(buyer.db, 'IN')).toBe(balance);

    // reported once; the new units can't be replaced again, but can still go back for a refund
    expect(await failure(reportNotReceived(buyer.db, order.id))).toBe('return_not_allowed:returned');
    expect(await failure(requestReturn(buyer.db, order.id, { items: [{ productId: item.id, qty: 1 }], reason: 'damaged', resolution: 'replacement' }))).toBe(
      'replacement_unavailable:already_replaced',
    );
    const back = await requestReturn(buyer.db, order.id, { items: [{ productId: item.id, qty: 1 }], reason: 'damaged' });
    expect(back).toMatchObject({ resolution: 'refund', status: 'requested' });
    expect(back.refundMinor).toBeGreaterThan(0);
  });

  it('not when something is sold out, which takes no stock and leaves the refund open', async () => {
    const order = await buyIn(1);
    await deliveredDaysAgo(order.id, 1);
    const stock = await stockOf(item.id);
    await setStock(item.id, 0);
    try {
      expect(await failure(reportNotReceived(buyer.db, order.id, 'replacement'))).toBe('replacement_unavailable:out_of_stock');
      expect(await stockOf(item.id)).toBe(0);
      expect((await getOrderReturns(buyer.db, order.id))?.returns).toHaveLength(0);
    } finally {
      await setStock(item.id, stock);
    }
    const r = await reportNotReceived(buyer.db, order.id);
    expect(r).toMatchObject({ resolution: 'refund', refund: { status: 'succeeded' } });
    expect(r.refundMinor).toBe(order.totals.totalMinor);
  });
});
