import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { storeBalance } from '@/lib/data/balance';
import { DataError } from '@/lib/data/errors';
import { cancelOrder, placeOrder, requestCancellation } from '@/lib/data/orders';
import { trackingSteps } from '@/lib/decision/tracking';
import { admin, deleteUser, IN_SHIPPING, newUser, pickProduct, stockOf, US_SHIPPING, type TestUser } from './helpers';

/** What a call failed with, as `code:detail` (or 'no error'). */
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
  return 'no error';
};

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** Shipped, and out for delivery `outIn` from now (negative: already out; delivered 2 hours after). */
async function onItsWay(orderId: string, outIn = 5 * HOUR): Promise<void> {
  const out = Date.now() + outIn;
  const shipped = Math.min(Date.now() - HOUR, out - HOUR);
  const { error } = await admin()
    .from('orders')
    .update({ placed_at: iso(shipped - 10 * HOUR), shipped_at: iso(shipped), out_for_delivery_at: iso(out), delivered_at: iso(out + 2 * HOUR) })
    .eq('id', orderId);
  if (error) throw error;
}

let buyer: TestUser;
let other: TestUser;
let us: { id: string };
let inProduct: { id: string };

beforeAll(async () => {
  [buyer, other, us, inProduct] = await Promise.all([newUser('Stop Order Buyer'), newUser('Stop Order Other'), pickProduct('US', 91), pickProduct('IN', 91)]);
});

afterAll(async () => {
  await Promise.all([deleteUser(buyer), deleteUser(other)]);
});

const buy = (qty = 1) => placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, buyNow: { productId: us.id, qty } });

describe('requesting cancellation of a shipped order', () => {
  it('stops it on its way: cancelled, stock back and refunded, once', async () => {
    const order = await buy(2);
    await onItsWay(order.id);
    expect(await failure(cancelOrder(buyer.db, order.id))).toBe('order_not_cancellable:');
    expect(await failure(requestCancellation(other.db, order.id))).toBe('order_not_found:');
    const stock = await stockOf(us.id);
    const balance = (await storeBalance(buyer.db, 'US')) ?? 0;

    const done = await requestCancellation(buyer.db, order.id);
    expect(done).toMatchObject({ status: 'cancelled', cancelReason: 'intercepted', refund: { status: 'succeeded', amountMinor: order.totals.totalMinor } });
    expect(trackingSteps(done).map((s) => s.label)).toEqual(['Order placed', 'Shipped', 'Cancelled']);
    expect(await stockOf(us.id)).toBe(stock + 2);
    expect(await storeBalance(buyer.db, 'US')).toBe(balance + order.totals.totalMinor);

    // asking again changes nothing
    expect((await requestCancellation(buyer.db, order.id)).status).toBe('cancelled');
    expect(await stockOf(us.id)).toBe(stock + 2);
    expect(await storeBalance(buyer.db, 'US')).toBe(balance + order.totals.totalMinor);
  });

  it('not once it is out for delivery or delivered', async () => {
    const order = await buy();
    await onItsWay(order.id, -60_000);
    expect(await failure(requestCancellation(buyer.db, order.id))).toBe('order_not_cancellable:out_for_delivery');
    await onItsWay(order.id, -3 * HOUR);
    expect(await failure(requestCancellation(buyer.db, order.id))).toBe('order_not_cancellable:delivered');
  });

  it('one that hasn’t shipped yet is simply cancelled', async () => {
    const order = await buy();
    expect(await requestCancellation(buyer.db, order.id)).toMatchObject({ status: 'cancelled', cancelReason: 'customer' });
  });

  it('pay on delivery was never charged', async () => {
    const order = await placeOrder(buyer.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId: inProduct.id, qty: 1 } });
    await onItsWay(order.id);
    expect(await requestCancellation(buyer.db, order.id)).toMatchObject({ status: 'cancelled', cancelReason: 'intercepted', refund: { status: 'not_charged' } });
  });

  it('is served at POST /orders/:id/request-cancellation', async () => {
    const { POST } = await import('@/app/api/v1/orders/[id]/request-cancellation/route');
    const [stopped, late] = await Promise.all([buy(), buy()]);
    await Promise.all([onItsWay(stopped.id), onItsWay(late.id, -60_000)]);
    // a bearer token: the cookie client needs a Next request scope
    const token = (await buyer.db.auth.getSession()).data.session!.access_token;
    const post = (id: string) =>
      POST(
        new NextRequest(`http://localhost/api/v1/orders/${id}/request-cancellation`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'x-market': 'US' },
        }),
        { params: Promise.resolve({ id }) },
      );
    const ok = await post(stopped.id);
    expect(ok.status).toBe(200);
    expect((await ok.json()).order).toMatchObject({ status: 'cancelled', cancelReason: 'intercepted' });
    const no = await post(late.id);
    expect(no.status).toBe(409);
    expect((await no.json()).error).toMatchObject({ code: 'order_not_cancellable', detail: 'out_for_delivery' });
  });
});
