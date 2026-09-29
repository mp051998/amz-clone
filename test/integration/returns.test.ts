import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setCartQty } from '@/lib/data/cart';
import { deliverOrder } from '@/lib/data/admin-orders';
import { getStoreReturn, listAdminReturns, receiveReturn, rejectReturn, retryReturnRefund } from '@/lib/data/admin-returns';
import { DataError } from '@/lib/data/errors';
import { placeOrder } from '@/lib/data/orders';
import { refundReturn, type RefundStripe } from '@/lib/data/refunds';
import { cancelReturn, canStartReturn, getOrderReturns, requestReturn, returnSummaries } from '@/lib/data/returns';
import { stripe } from '@/lib/stripe';
import type { Market, Order, PaymentMethod } from '@/lib/types';
import { admin, deleteUser, IN_SHIPPING, newUser, pickProduct, stockOf, US_SHIPPING, type TestUser } from './helpers';

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}${err.detail ? `:${err.detail}` : ''}` : String(err);
  }
  return 'no error';
};

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

let buyer: TestUser;
let other: TestUser;
let boss: TestUser;

beforeAll(async () => {
  [buyer, other, boss] = await Promise.all([newUser('Returns Buyer'), newUser('Returns Other'), newUser('Returns Admin')]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
});

afterAll(async () => {
  await Promise.all([deleteUser(buyer), deleteUser(other), deleteUser(boss)]);
});

/** An order of two products (2 of the first, 1 of the second) by `buyer`. */
async function twoItemOrder(market: Market, method: PaymentMethod, offset: number): Promise<{ order: Order; a: string; b: string }> {
  const [a, b] = await Promise.all([pickProduct(market, offset), pickProduct(market, offset + 1)]);
  await buyer.db.rpc('cart_clear', { p_market: market });
  await setCartQty(buyer.db, market, a.id, 2);
  await setCartQty(buyer.db, market, b.id, 1);
  const order = await placeOrder(buyer.db, market, { paymentMethod: method, shipping: market === 'IN' ? IN_SHIPPING : US_SHIPPING });
  return { order, a: a.id, b: b.id };
}

/** Delivered `daysAgo` days ago (service role, as time passing would). */
async function deliveredDaysAgo(id: string, daysAgo: number) {
  const at = Date.now() - daysAgo * DAY;
  const { error } = await admin()
    .from('orders')
    .update({ placed_at: iso(at - 3 * DAY), shipped_at: iso(at - 2 * DAY), out_for_delivery_at: iso(at - 60_000), delivered_at: iso(at) })
    .eq('id', id);
  if (error) throw error;
}

describe('returns', () => {
  let order: Order;
  let a: string;
  let b: string;
  const unit = (id: string) => order.items.find((i) => i.productId === id)!.unitPriceMinor;

  beforeAll(async () => {
    ({ order, a, b } = await twoItemOrder('US', 'giftcard', 30));
  });

  it('can’t start before delivery', async () => {
    const before = await getOrderReturns(buyer.db, order.id);
    expect(before).toMatchObject({ delivered: false, returnBy: undefined, returns: [] });
    expect(canStartReturn(before!)).toBe(false);
    expect(await failure(requestReturn(buyer.db, order.id, { items: [{ productId: a, qty: 1 }], reason: 'no_longer_needed' }))).toBe('return_not_allowed:not_delivered');
  });

  it('opens a window from delivery, per store, with every item returnable', async () => {
    await deliverOrder(boss.db, order.id);
    const r = (await getOrderReturns(buyer.db, order.id))!;
    expect(r.delivered).toBe(true);
    expect(r.returnable).toEqual({ [a]: 2, [b]: 1 });
    const { data } = await admin().from('orders').select('delivered_at').eq('id', order.id).single();
    expect(Date.parse(r.returnBy!) - Date.parse(data!.delivered_at!)).toBe(30 * DAY);
    expect(canStartReturn(r)).toBe(true);
    // not someone else's business
    expect(await getOrderReturns(other.db, order.id)).toBeNull();
    expect(await failure(requestReturn(other.db, order.id, { items: [{ productId: a, qty: 1 }], reason: 'damaged' }))).toBe('order_not_found');
  });

  it('checks the reason and the items', async () => {
    const start = (items: unknown, reason: unknown = 'no_longer_needed') => failure(requestReturn(buyer.db, order.id, { items, reason }));
    expect(await start([{ productId: a, qty: 1 }], 'meh')).toBe('invalid_input:reason');
    expect(await start([])).toBe('invalid_input:items');
    expect(await start([{ productId: a, qty: 3 }])).toBe('invalid_input:items');
    expect(await start([{ productId: 'not-in-order', qty: 1 }])).toBe('invalid_input:items');
    // the same product twice adds up (1 + 2 > 2 ordered)
    const twice = await buyer.db.rpc('request_return', { p_order_id: order.id, p_items: [{ product_id: a, qty: 1 }, { product_id: a, qty: 2 }], p_reason: 'damaged' });
    expect([twice.error?.message, twice.error?.details]).toEqual(['invalid_input', 'items']);
  });

  it('a change-of-mind return refunds the items and their tax, not delivery; it can be cancelled', async () => {
    const r = await requestReturn(buyer.db, order.id, { items: [{ productId: a, qty: 1 }], reason: 'no_longer_needed', comment: '  Too big  ' });
    expect(r).toMatchObject({ status: 'requested', reason: 'no_longer_needed', comment: 'Too big', itemsMinor: unit(a), shipMinor: 0 });
    expect(r.taxMinor).toBe(Math.round((order.totals.taxMinor * unit(a)) / order.totals.subtotalMinor));
    expect(r.refundMinor).toBe(r.itemsMinor + r.taxMinor);
    expect(r.items).toEqual([expect.objectContaining({ productId: a, qty: 1 })]);
    expect(r.dropoffCode).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(Date.parse(r.dropoffBy) - Date.parse(r.createdAt)).toBe(14 * DAY);
    expect((await getOrderReturns(buyer.db, order.id))!.returnable).toEqual({ [a]: 1, [b]: 1 });
    expect(await failure(requestReturn(buyer.db, order.id, { items: [{ productId: a, qty: 2 }], reason: 'damaged' }))).toBe('invalid_input:items');
    expect(await returnSummaries(buyer.db, [order.id])).toEqual(new Map([[order.id, 'requested']]));
    expect((await returnSummaries(other.db, [order.id])).size).toBe(0);

    expect(await failure(cancelReturn(other.db, r.id))).toBe('return_not_found');
    expect(await cancelReturn(buyer.db, r.id)).toMatchObject({ status: 'cancelled' });
    expect(await failure(cancelReturn(buyer.db, r.id))).toBe('return_not_open');
    expect((await getOrderReturns(buyer.db, order.id))!.returnable).toEqual({ [a]: 2, [b]: 1 });
  });

  it('returning the rest for a store fault refunds everything; receiving restocks and refunds at once', async () => {
    const r = await requestReturn(buyer.db, order.id, {
      items: [{ productId: a, qty: 2 }, { productId: b, qty: 1 }],
      reason: 'damaged',
    });
    // the last return of an order's items gets all the tax that's left, and store faults the delivery share
    expect(r.refundMinor).toBe(order.totals.totalMinor);
    expect(canStartReturn((await getOrderReturns(buyer.db, order.id))!)).toBe(false);

    const open = await listAdminReturns(boss.db, 'US');
    expect(open.returns.map((x) => x.id)).toContain(r.id);
    expect(open.counts.open).toBeGreaterThanOrEqual(1);
    const listed = open.returns.find((x) => x.id === r.id)!;
    expect(listed).toMatchObject({ order: { id: order.id, paymentMethod: 'giftcard', market: 'US' }, customer: { email: buyer.email } });

    const [stockA, stockB] = await Promise.all([stockOf(a), stockOf(b)]);
    const got = await receiveReturn(boss.db, r.id);
    expect(got).toMatchObject({ status: 'received', refund: { status: 'succeeded' } });
    expect(got.refund?.refundedAt).toBeTruthy();
    expect([await stockOf(a), await stockOf(b)]).toEqual([stockA + 2, stockB + 1]);
    expect(await failure(receiveReturn(boss.db, r.id))).toBe('return_not_open');
    expect(await failure(rejectReturn(boss.db, r.id))).toBe('return_not_open');
    expect(await failure(cancelReturn(buyer.db, r.id))).toBe('return_not_open');

    const closed = await listAdminReturns(boss.db, 'US', { filter: 'closed' });
    expect(closed.returns.map((x) => x.id)).toContain(r.id);
    const mine = (await getOrderReturns(buyer.db, order.id))!.returns;
    expect(mine.map((x) => x.status)).toEqual(['received', 'cancelled']);
    expect(await returnSummaries(buyer.db, [order.id])).toEqual(new Map([[order.id, 'refunded']]));
  });

  it('closes after the window, and admins can reject with a note', async () => {
    const { order: late, a: la } = await twoItemOrder('IN', 'cod', 30);
    await deliveredDaysAgo(late.id, 11); // India: 10 days
    expect(await failure(requestReturn(buyer.db, late.id, { items: [{ productId: la, qty: 1 }], reason: 'defective' }))).toBe('return_not_allowed:window_closed');
    await deliveredDaysAgo(late.id, 9);
    const r = await requestReturn(buyer.db, late.id, { items: [{ productId: la, qty: 1 }], reason: 'defective' });
    expect(r.shipMinor).toBe(Math.round((late.totals.shipMinor * r.itemsMinor) / late.totals.subtotalMinor));

    expect(await failure(getStoreReturn(boss.db, 'US', r.id))).toBe('return_not_found');
    expect(await failure(rejectReturn(boss.db, r.id, 'x'.repeat(501)))).toBe('invalid_input:note');
    const rejected = await rejectReturn(boss.db, r.id, '  Item was used and missing its box. ');
    expect(rejected).toMatchObject({ status: 'rejected', rejectNote: 'Item was used and missing its box.', refund: undefined });
    expect((await getOrderReturns(buyer.db, late.id))!.returns[0]).toMatchObject({ status: 'rejected', rejectNote: 'Item was used and missing its box.' });
    // a rejected return frees its items again
    expect((await getOrderReturns(buyer.db, late.id))!.returnable[la]).toBe(2);
  });

  it('only admins list, receive or reject; nobody writes the tables directly', async () => {
    expect(await failure(listAdminReturns(buyer.db, 'US'))).toBe('forbidden');
    expect(await failure(receiveReturn(buyer.db, crypto.randomUUID()))).toBe('forbidden');
    expect(await failure(rejectReturn(other.db, crypto.randomUUID()))).toBe('forbidden');
    expect(await failure(receiveReturn(boss.db, crypto.randomUUID()))).toBe('return_not_found');
    const { data: mine } = await buyer.db.from('returns').select('id').eq('order_id', order.id);
    expect(mine?.length).toBe(2);
    const write = await buyer.db.from('returns').update({ status: 'received' }).eq('order_id', order.id).select('id');
    expect(write.error ?? write.data?.length).toBeTruthy();
    expect(write.data ?? []).toEqual([]);
    expect(await buyer.db.rpc('record_return_refund', { p_return_id: mine![0].id, p_refund_id: null, p_status: 'succeeded' }).then((r) => r.error?.code)).toBe('42501');
  });
});

describe('return refunds on cards', () => {
  const fake = (status = 'pending') => {
    const calls: { amount?: number; key?: string; metadata?: Record<string, string> }[] = [];
    const s: RefundStripe = {
      refunds: {
        list: async () => ({ data: [{ id: 're_order', status: 'succeeded', metadata: { orderId: 'x' } }] }),
        create: async (params, options) => {
          calls.push({ amount: params.amount, key: options.idempotencyKey, metadata: params.metadata as Record<string, string> });
          return { id: 're_return', status };
        },
      },
      checkout: { sessions: { retrieve: async () => ({ payment_intent: 'pi_session' }) } },
    };
    return { s, calls };
  };

  it('asks Stripe for the return’s amount, keyed by return, apart from other refunds on the payment', async () => {
    const { order, a } = await twoItemOrder('US', 'card', 34);
    const svc = admin();
    await svc.from('orders').update({ status: 'placed', placed_at: iso(Date.now() - 4 * DAY) }).eq('id', order.id);
    await svc.rpc('record_payment_intent', { p_order_id: order.id, p_payment_intent: 'pi_fake' });
    await deliveredDaysAgo(order.id, 1);
    const r = await requestReturn(buyer.db, order.id, { items: [{ productId: a, qty: 1 }], reason: 'wrong_item' });
    const got = await boss.db.rpc('admin_receive_return', { p_return_id: r.id });
    expect((got.data as { refund_status: string }).refund_status).toBe('pending');

    const f = fake();
    expect(await refundReturn(r.id, { db: svc, stripe: f.s })).toBe('pending');
    // the order's own (succeeded) refund on the same payment isn't mistaken for this one
    expect(f.calls).toEqual([{ amount: r.refundMinor, key: `return-${r.id}-0`, metadata: { orderId: order.id, returnId: r.id } }]);
    const read = async () => (await svc.from('returns').select('refund_status, stripe_refund_id, refunded_at').eq('id', r.id).single()).data!;
    expect(await read()).toMatchObject({ refund_status: 'pending', stripe_refund_id: 're_return' });
    await svc.rpc('record_return_refund', { p_return_id: r.id, p_refund_id: 're_return', p_status: 'succeeded' });
    await svc.rpc('record_return_refund', { p_return_id: r.id, p_refund_id: 're_return', p_status: 'pending' });
    expect(await read()).toMatchObject({ refund_status: 'succeeded' });
    expect((await retryReturnRefund(boss.db, r.id)).refund?.status).toBe('succeeded');
  });
});

// Real Stripe test mode: two returns of one card payment are two partial refunds.
describe.runIf(stripe)('stripe return refunds', () => {
  it('refunds each received return once, for its own amount', async () => {
    const { order, a, b } = await twoItemOrder('US', 'card', 36);
    const pi = await stripe!.paymentIntents.create({
      amount: order.totals.totalMinor,
      currency: 'usd',
      payment_method: 'pm_card_visa',
      payment_method_types: ['card'],
      confirm: true,
      metadata: { orderId: order.id },
    });
    const svc = admin();
    await svc.from('orders').update({ status: 'placed', placed_at: iso(Date.now() - 4 * DAY), payment_label: 'Visa ending 4242' }).eq('id', order.id);
    await svc.rpc('record_payment_intent', { p_order_id: order.id, p_payment_intent: pi.id });
    await deliveredDaysAgo(order.id, 2);

    const first = await requestReturn(buyer.db, order.id, { items: [{ productId: a, qty: 1 }], reason: 'no_longer_needed' });
    const second = await requestReturn(buyer.db, order.id, { items: [{ productId: a, qty: 1 }, { productId: b, qty: 1 }], reason: 'defective' });
    const got1 = await receiveReturn(boss.db, first.id);
    const got2 = await receiveReturn(boss.db, second.id);
    expect(['pending', 'succeeded']).toContain(got1.refund?.status);
    expect(['pending', 'succeeded']).toContain(got2.refund?.status);

    const refunds = (await stripe!.refunds.list({ payment_intent: pi.id })).data;
    expect(refunds.map((x) => [x.metadata?.returnId, x.amount]).sort()).toEqual(
      [[first.id, first.refundMinor], [second.id, second.refundMinor]].sort(),
    );
    // asking again doesn't refund twice
    await refundReturn(first.id);
    expect((await stripe!.refunds.list({ payment_intent: pi.id })).data).toHaveLength(2);
  });
});
