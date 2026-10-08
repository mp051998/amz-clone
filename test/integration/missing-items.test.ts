import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { storeBalance } from '@/lib/data/balance';
import { DataError } from '@/lib/data/errors';
import { reportMissingItems } from '@/lib/data/missing-items';
import { reportNotReceived } from '@/lib/data/not-received';
import { placeOrder } from '@/lib/data/orders';
import { getOrderReturns, requestReturn } from '@/lib/data/returns';
import { deleteUser, deliveredDaysAgo, newUser, pickProduct, stockOf, US_SHIPPING, type TestUser } from './helpers';

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
let lamp: { id: string };
let mug: { id: string };

beforeAll(async () => {
  [buyer, other, lamp, mug] = await Promise.all([newUser('Missing Items Buyer'), newUser('Missing Items Other'), pickProduct('US', 119), pickProduct('US', 120)]);
});

afterAll(async () => {
  await Promise.all([deleteUser(buyer), deleteUser(other)]);
});

const buy = (productId: string, qty = 1) => placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, buyNow: { productId, qty } });

describe('items missing from a package', () => {
  it('refunds the missing items at once, with nothing to send back or restock', async () => {
    const order = await buy(lamp.id, 3);
    const one = [{ productId: lamp.id, qty: 1 }];
    expect(await failure(reportMissingItems(buyer.db, order.id, { items: one }))).toBe('return_not_allowed:not_delivered');
    await deliveredDaysAgo(order.id, 1);
    expect(await failure(reportMissingItems(other.db, order.id, { items: one }))).toBe('order_not_found:');
    // not a reason a return can be started with
    expect(await failure(requestReturn(buyer.db, order.id, { items: one, reason: 'missing_item' }))).toBe('invalid_input:reason');

    const [stock, balance] = await Promise.all([stockOf(lamp.id), storeBalance(buyer.db, 'US')]);
    const r = await reportMissingItems(buyer.db, order.id, { items: one, comment: 'Two in the box, not three' });
    expect(r).toMatchObject({ reason: 'missing_item', resolution: 'refund', status: 'received', refund: { status: 'succeeded' } });
    expect(r.items).toEqual([expect.objectContaining({ productId: lamp.id, qty: 1 })]);
    // the store's fault: a share of the delivery charge comes back too, when there was one
    expect(r.refundMinor).toBeGreaterThan(0);
    expect(r.refundMinor).toBe(r.itemsMinor + r.taxMinor + r.shipMinor);
    expect(await storeBalance(buyer.db, 'US')).toBe((balance ?? 0) + r.refundMinor);
    expect(await stockOf(lamp.id)).toBe(stock);

    // the package did arrive, and what's left can still be returned, but not more than that
    expect(await failure(reportNotReceived(buyer.db, order.id))).toBe('return_not_allowed:returned');
    await requestReturn(buyer.db, order.id, { items: [{ productId: lamp.id, qty: 2 }], reason: 'no_longer_needed' });
    expect(await failure(reportMissingItems(buyer.db, order.id, { items: one }))).toBe('invalid_input:items');
    expect((await getOrderReturns(buyer.db, order.id))?.returns.map((x) => x.reason).sort()).toEqual(['missing_item', 'no_longer_needed']);
  });

  it('sends the missing items again at no charge, out of stock now', async () => {
    const order = await buy(mug.id, 2);
    await deliveredDaysAgo(order.id, 2);
    const [stock, balance] = await Promise.all([stockOf(mug.id), storeBalance(buyer.db, 'US')]);
    const r = await reportMissingItems(buyer.db, order.id, { items: [{ productId: mug.id, qty: 1 }], resolution: 'replacement' });
    expect(r).toMatchObject({ reason: 'missing_item', resolution: 'replacement', status: 'received', refundMinor: 0 });
    expect(r.replacement).toBeDefined();
    expect(await stockOf(mug.id)).toBe(stock - 1);
    expect(await storeBalance(buyer.db, 'US')).toBe(balance);
  });

  it('not once the return window has closed', async () => {
    const order = await buy(lamp.id);
    await deliveredDaysAgo(order.id, 31);
    expect(await failure(reportMissingItems(buyer.db, order.id, { items: [{ productId: lamp.id, qty: 1 }] }))).toBe('return_not_allowed:window_closed');
  });

  it('is served at POST /orders/:id/missing-items', async () => {
    const { POST } = await import('@/app/api/v1/orders/[id]/missing-items/route');
    const order = await buy(lamp.id, 2);
    await deliveredDaysAgo(order.id, 1);
    // a bearer token: the cookie client needs a Next request scope
    const token = (await buyer.db.auth.getSession()).data.session!.access_token;
    const post = (body: unknown) =>
      POST(
        new NextRequest(`http://localhost/api/v1/orders/${order.id}/missing-items`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'x-market': 'US', 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: order.id }) },
      );
    expect((await post({ items: [] })).status).toBe(422);
    const res = await post({ items: [{ productId: lamp.id, qty: 1 }] });
    expect(res.status).toBe(201);
    expect((await res.json()).return).toMatchObject({ reason: 'missing_item', status: 'received' });
  });
});
