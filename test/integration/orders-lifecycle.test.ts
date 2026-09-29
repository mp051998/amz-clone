import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { setCartQty } from '@/lib/data/cart';
import { adminCancelOrder, deliverOrder, getAdminOrder, listAdminOrders, retryRefund, shipOrder } from '@/lib/data/admin-orders';
import { DataError } from '@/lib/data/errors';
import { cancelOrder, getOrder, listOrders, placeOrder } from '@/lib/data/orders';
import { refundOrder, settleRefund, type RefundStripe } from '@/lib/data/refunds';
import { deliveryAfter, orderStage, plannedSchedule } from '@/lib/decision/tracking';
import { stripe } from '@/lib/stripe';
import type { Market, PaymentMethod } from '@/lib/types';
import { POST as webhook } from '@/app/api/v1/webhooks/stripe/route';
import { admin, deleteUser, IN_SHIPPING, newUser, pickProduct, stockOf, US_SHIPPING, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

const HOUR = 3_600_000;
const TZ = { US: 'America/Los_Angeles', IN: 'Asia/Kolkata' } as const;
const iso = (ms: number) => new Date(ms).toISOString();
const same = (a: string | null | undefined, b: string | null | undefined) => expect(a && Date.parse(a)).toBe(b && Date.parse(b));

let buyer: TestUser;
let other: TestUser;
let boss: TestUser;

beforeAll(async () => {
  [buyer, other, boss] = await Promise.all([newUser('Lifecycle Buyer'), newUser('Lifecycle Other'), newUser('Lifecycle Admin')]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
});

afterAll(async () => {
  await Promise.all([deleteUser(buyer), deleteUser(other), deleteUser(boss)]);
});

/** One unit of a product, ordered by `buyer`. */
async function order(market: Market, method: PaymentMethod, offset = 20) {
  const p = await pickProduct(market, offset);
  // unpaid card orders keep the cart, so start from an empty one
  await buyer.db.rpc('cart_clear', { p_market: market });
  await setCartQty(buyer.db, market, p.id, 1);
  const o = await placeOrder(buyer.db, market, { paymentMethod: method, shipping: market === 'IN' ? IN_SHIPPING : US_SHIPPING });
  return { p, order: o };
}

/** Move an order's saved schedule so it is `hoursAgo` into its life (service role, as time passing would). */
async function age(id: string, hoursAgo: number) {
  const { data } = await admin().from('orders').select('placed_at, shipped_at, out_for_delivery_at, delivered_at').eq('id', id).single();
  const shift = (v: string | null) => (v ? iso(Date.parse(v) - hoursAgo * HOUR) : v);
  const { error } = await admin()
    .from('orders')
    .update({
      placed_at: shift(data!.placed_at),
      shipped_at: shift(data!.shipped_at),
      out_for_delivery_at: shift(data!.out_for_delivery_at),
      delivered_at: shift(data!.delivered_at),
    })
    .eq('id', id);
  if (error) throw error;
}

describe('saved schedule', () => {
  it('is filled when an order is placed, matching the storefront plan in each store’s time zone', async () => {
    for (const [market, method] of [['US', 'giftcard'], ['IN', 'upi']] as const) {
      const { order: o } = await order(market, method);
      expect(o.status).toBe('placed');
      const plan = plannedSchedule(o.placedAt!, TZ[market]);
      same(o.shippedAt, plan.shippedAt);
      same(o.outForDeliveryAt, plan.outForDeliveryAt);
      same(o.deliveredAt, plan.deliveredAt);
      expect(orderStage(o)).toBe('preparing');
    }
  });

  it('unpaid card orders have no schedule until paid; the trigger fills it on payment', async () => {
    const { order: o } = await order('US', 'card', 21);
    expect(o.status).toBe('awaiting_payment');
    expect(o.shippedAt).toBeUndefined();
    const placedAt = iso(Date.now());
    await admin().from('orders').update({ status: 'placed', placed_at: placedAt }).eq('id', o.id);
    const paid = await getOrder(buyer.db, o.id);
    same(paid?.shippedAt, plannedSchedule(placedAt, TZ.US).shippedAt);
    await adminCancelOrder(boss.db, o.id);
  });

  it('the stage follows the saved times, in the database and here', async () => {
    const { order: o } = await order('US', 'giftcard');
    await age(o.id, 11);
    const shipped = await getAdminOrder(boss.db, o.id);
    expect(shipped?.stage).toBe('shipped');
    expect(orderStage(shipped!)).toBe('shipped');
    await age(o.id, 100);
    expect((await getAdminOrder(boss.db, o.id))?.stage).toBe('delivered');
  });
});

describe('shopper cancel', () => {
  it('cancels before shipping: stock back, refund state by payment method', async () => {
    const cases = [
      ['US', 'giftcard', 'succeeded'],
      ['IN', 'upi', 'succeeded'],
      ['IN', 'cod', 'not_charged'],
    ] as const;
    for (const [market, method, refund] of cases) {
      const { p, order: o } = await order(market, method, 22);
      const reserved = await stockOf(p.id);
      const done = await cancelOrder(buyer.db, o.id);
      expect(done).toMatchObject({ status: 'cancelled', cancelReason: 'customer' });
      expect(done.refund).toMatchObject({ status: refund, amountMinor: o.totals.totalMinor });
      expect(Boolean(done.refund?.refundedAt)).toBe(refund === 'succeeded');
      expect(done.cancelledAt).toBeTruthy();
      expect(await stockOf(p.id)).toBe(reserved + 1);
      // repeating is harmless; the stock isn't returned twice
      expect((await cancelOrder(buyer.db, o.id)).status).toBe('cancelled');
      expect(await stockOf(p.id)).toBe(reserved + 1);
    }
  });

  it('not once it has shipped, and never someone else’s order', async () => {
    const { order: o } = await order('US', 'giftcard');
    expect(await code(cancelOrder(other.db, o.id))).toBe('order_not_found');
    await age(o.id, 10);
    expect(await code(cancelOrder(buyer.db, o.id))).toBe('order_not_cancellable');
    expect((await getOrder(buyer.db, o.id))?.status).toBe('placed');
  });

  it('an unpaid checkout is cancelled as before (no refund owed)', async () => {
    const { order: o } = await order('US', 'card', 21);
    const done = await cancelOrder(buyer.db, o.id);
    expect(done.status).toBe('cancelled');
    expect(done.refund).toBeUndefined();
  });

  it('the orders list keeps cancelled orders but not abandoned checkouts', async () => {
    const mine = await listOrders(buyer.db, 'US');
    expect(mine.some((o) => o.status === 'cancelled' && o.refund)).toBe(true);
    expect(mine.some((o) => o.status === 'cancelled' && !o.placedAt && !o.refund)).toBe(false);
    expect(mine.every((o) => o.status !== 'awaiting_payment')).toBe(true);
  });

  it('customers cannot touch the refund or schedule columns, nor call the service RPCs', async () => {
    const { order: o } = await order('US', 'giftcard');
    const upd = await buyer.db.from('orders').update({ delivered_at: iso(Date.now()), refund_status: 'succeeded' }).eq('id', o.id).select('id');
    expect(upd.data ?? []).toEqual([]);
    for (const [fn, args] of [
      ['record_refund', { p_order_id: o.id, p_refund_id: 're_x', p_status: 'succeeded' }],
      ['record_payment_intent', { p_order_id: o.id, p_payment_intent: 'pi_x' }],
      ['mark_sold_out', { p_order_id: o.id }],
    ] as const) {
      expect((await buyer.db.rpc(fn, args as never)).error).not.toBeNull();
    }
    await adminCancelOrder(boss.db, o.id);
  });
});

describe('admin orders', () => {
  it('non-admins get forbidden', async () => {
    const { order: o } = await order('US', 'giftcard');
    expect(await code(listAdminOrders(buyer.db, 'US'))).toBe('forbidden');
    expect(await code(getAdminOrder(buyer.db, o.id))).toBe('forbidden');
    expect(await code(shipOrder(buyer.db, o.id))).toBe('forbidden');
    expect(await code(deliverOrder(other.db, o.id))).toBe('forbidden');
    expect(await code(adminCancelOrder(other.db, o.id))).toBe('forbidden');
    expect(await code(retryRefund(other.db, o.id))).toBe('forbidden');
    await adminCancelOrder(boss.db, o.id);
  });

  it('ship now pulls delivery forward; deliver now finishes it; neither goes backwards', async () => {
    const { order: o } = await order('IN', 'upi');
    const before = Date.now();
    const shipped = await shipOrder(boss.db, o.id);
    expect(shipped.stage).toBe('shipped');
    const at = Date.parse(shipped.shippedAt!);
    expect(at).toBeGreaterThanOrEqual(before - 5_000);
    const planned = deliveryAfter(at, TZ.IN);
    expect(Date.parse(shipped.deliveredAt!)).toBe(Math.min(Date.parse(o.deliveredAt!), planned.delivered));
    // repeating is a no-op
    same((await shipOrder(boss.db, o.id)).shippedAt, shipped.shippedAt);

    const delivered = await deliverOrder(boss.db, o.id);
    expect(delivered.stage).toBe('delivered');
    same(delivered.shippedAt, shipped.shippedAt);
    expect(Date.parse(delivered.deliveredAt!)).toBeLessThanOrEqual(Date.now() + 5_000);
    same((await deliverOrder(boss.db, o.id)).deliveredAt, delivered.deliveredAt);
    expect(orderStage((await getOrder(buyer.db, o.id))!)).toBe('delivered');

    expect(await code(adminCancelOrder(boss.db, o.id))).toBe('order_not_cancellable');
  });

  it('admins cancel until delivered; cancelled or unpaid orders can’t be moved', async () => {
    const { p, order: o } = await order('US', 'giftcard', 23);
    await age(o.id, 11); // shipped an hour ago, not delivered yet
    const reserved = await stockOf(p.id);
    const done = await adminCancelOrder(boss.db, o.id);
    expect(done).toMatchObject({ status: 'cancelled', stage: 'cancelled', cancelReason: 'admin' });
    expect(done.refund?.status).toBe('succeeded');
    expect(await stockOf(p.id)).toBe(reserved + 1);
    expect(await code(shipOrder(boss.db, o.id))).toBe('order_not_open');
    expect(await code(deliverOrder(boss.db, o.id))).toBe('order_not_open');

    const { order: unpaid } = await order('US', 'card', 21);
    expect(await code(shipOrder(boss.db, unpaid.id))).toBe('order_not_open');
    expect((await adminCancelOrder(boss.db, unpaid.id)).status).toBe('cancelled');
  });

  it('lists with stage filters, counts and search', async () => {
    const { order: fresh } = await order('US', 'giftcard');
    const byEmail = await listAdminOrders(boss.db, 'US', { q: buyer.email });
    expect(byEmail.total).toBeGreaterThan(3);
    expect(byEmail.orders.every((o) => o.customer.email === buyer.email)).toBe(true);
    expect(byEmail.orders[0]).toMatchObject({ id: fresh.id, stage: 'preparing', itemCount: 1 });
    // abandoned checkouts aren't listed
    expect(byEmail.orders.some((o) => o.status === 'cancelled' && !o.placedAt && !o.refundStatus)).toBe(false);

    const byId = await listAdminOrders(boss.db, 'US', { q: fresh.id.slice(0, 11) });
    expect(byId.orders.map((o) => o.id)).toContain(fresh.id);
    expect((await listAdminOrders(boss.db, 'US', { q: '%' })).total).toBe(0);

    const cancelled = await listAdminOrders(boss.db, 'US', { filter: 'cancelled', q: buyer.email });
    expect(cancelled.orders.length).toBeGreaterThan(0);
    expect(cancelled.orders.every((o) => o.stage === 'cancelled')).toBe(true);
    const all = await listAdminOrders(boss.db, 'US');
    const { counts } = all;
    expect(counts.all).toBe(all.total);
    expect(counts.preparing + counts.shipped + counts.delivered + counts.cancelled).toBe(counts.all);
    // the IN store's list is separate
    expect((await listAdminOrders(boss.db, 'IN', { q: fresh.id })).total).toBe(0);
    expect(await code(listAdminOrders(boss.db, 'US', { filter: 'nope' as never }))).toBe('invalid_input');
    await adminCancelOrder(boss.db, fresh.id);
  });
});

describe('refund bookkeeping', () => {
  const fake = (over: Partial<{ list: string[]; fail: boolean; status: string }> = {}) => {
    const calls: { create: { amount?: number; key?: string }[] } = { create: [] };
    const s: RefundStripe = {
      refunds: {
        list: async () => ({ data: (over.list ?? []).map((status, i) => ({ id: `re_${i}`, status })) }),
        create: async (params, options) => {
          calls.create.push({ amount: params.amount, key: options.idempotencyKey });
          if (over.fail) throw new Error('card_declined');
          return { id: 're_new', status: over.status ?? 'succeeded' };
        },
      },
      checkout: { sessions: { retrieve: async () => ({ payment_intent: 'pi_from_session' }) } },
    };
    return { s, calls };
  };
  const target = { orderId: 'o1', amountMinor: 1234, paymentIntent: 'pi_1', sessionId: null };

  it('reuses a refund under way, else creates one keyed by attempt', async () => {
    let f = fake({ list: ['failed', 'pending'] });
    expect(await settleRefund(target, f.s)).toEqual({ paymentIntent: 'pi_1', refundId: 're_1', status: 'pending' });
    expect(f.calls.create).toEqual([]);

    f = fake({ list: ['failed'], status: 'requires_action' });
    expect(await settleRefund(target, f.s)).toMatchObject({ refundId: 're_new', status: 'pending' });
    expect(f.calls.create).toEqual([{ amount: 1234, key: 'refund-o1-1' }]);

    f = fake();
    expect(await settleRefund({ ...target, paymentIntent: null, sessionId: 'cs_1' }, f.s)).toMatchObject({ paymentIntent: 'pi_from_session', status: 'succeeded' });

    f = fake({ fail: true });
    expect(await settleRefund(target, f.s)).toEqual({ paymentIntent: 'pi_1', refundId: null, status: 'failed' });
    expect(await settleRefund({ ...target, paymentIntent: null }, fake().s)).toMatchObject({ status: 'failed' });
  });

  it('records outcomes; stale reports never undo a settled refund', async () => {
    const { order: o } = await order('US', 'card', 21);
    await admin().from('orders').update({ status: 'placed', placed_at: iso(Date.now()) }).eq('id', o.id);
    const svc = admin();
    const f = fake({ status: 'pending' });
    const cancelled = await adminCancelOrder(boss.db, o.id); // Stripe isn't asked here: no PaymentIntent on record
    expect(cancelled.refund?.status).toBe('failed');

    await svc.rpc('record_payment_intent', { p_order_id: o.id, p_payment_intent: 'pi_fake' });
    expect(await refundOrder(o.id, { db: svc, stripe: f.s })).toBe('pending');
    const read = async () => (await svc.from('orders').select('refund_status, stripe_refund_id, refunded_at').eq('id', o.id).single()).data!;
    expect(await read()).toMatchObject({ refund_status: 'pending', stripe_refund_id: 're_new' });

    await svc.rpc('record_refund', { p_order_id: o.id, p_refund_id: 're_old', p_status: 'failed' });
    expect((await read()).refund_status).toBe('pending'); // failure of some other refund: ignored
    await svc.rpc('record_refund', { p_order_id: o.id, p_refund_id: 're_new', p_status: 'succeeded' });
    await svc.rpc('record_refund', { p_order_id: o.id, p_refund_id: 're_new', p_status: 'pending' });
    const settled = await read();
    expect(settled.refund_status).toBe('succeeded');
    expect(settled.refunded_at).toBeTruthy();
    // nothing left to do
    expect(await refundOrder(o.id, { db: svc, stripe: f.s })).toBe('succeeded');
  });

  it('non-card orders and orders without a refund are left alone', async () => {
    const { order: o } = await order('US', 'giftcard');
    expect(await refundOrder(o.id, { db: admin(), stripe: fake().s })).toBeNull();
    await adminCancelOrder(boss.db, o.id);
  });
});

// Real Stripe test-mode payments: a confirmed PaymentIntent is refunded through the helper.
describe.runIf(stripe)('stripe refunds', () => {
  const SECRET = 'whsec_integration_test';
  beforeAll(() => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });
  afterAll(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  /** A card order paid with Stripe's test Visa (hosted Checkout can't be completed from a test). */
  async function paidCardOrder() {
    const { order: o } = await order('US', 'card', 24);
    const pi = await stripe!.paymentIntents.create({
      amount: o.totals.totalMinor,
      currency: 'usd',
      payment_method: 'pm_card_visa',
      payment_method_types: ['card'],
      confirm: true,
      metadata: { orderId: o.id },
    });
    expect(pi.status).toBe('succeeded');
    const svc = admin();
    await svc.from('orders').update({ status: 'placed', placed_at: iso(Date.now()), payment_label: 'Visa ending 4242' }).eq('id', o.id);
    await svc.rpc('record_payment_intent', { p_order_id: o.id, p_payment_intent: pi.id });
    return { order: o, pi };
  }

  it('a shopper cancel refunds the card in full', async () => {
    const { order: o, pi } = await paidCardOrder();
    const done = await cancelOrder(buyer.db, o.id);
    expect(done.status).toBe('cancelled');
    expect(['pending', 'succeeded']).toContain(done.refund?.status);
    const refunds = await stripe!.refunds.list({ payment_intent: pi.id });
    expect(refunds.data).toHaveLength(1);
    expect(refunds.data[0]).toMatchObject({ amount: o.totals.totalMinor, metadata: { orderId: o.id } });
    // asking again doesn't refund twice
    await refundOrder(o.id);
    expect((await stripe!.refunds.list({ payment_intent: pi.id })).data).toHaveLength(1);
  });

  it('a signed refund.updated webhook settles the order', async () => {
    const { order: o, pi } = await paidCardOrder();
    await admin().from('orders').update({ status: 'cancelled', cancelled_at: iso(Date.now()), cancel_reason: 'admin', refund_status: 'pending', refund_minor: o.totals.totalMinor }).eq('id', o.id);
    const refund = await stripe!.refunds.create({ payment_intent: pi.id, metadata: { orderId: o.id } });
    const payload = JSON.stringify({
      id: `evt_${crypto.randomUUID()}`,
      object: 'event',
      type: 'refund.updated',
      data: { object: { ...refund, status: 'succeeded' } },
    });
    const header = stripe!.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const res = await webhook(new NextRequest('http://localhost/api/v1/webhooks/stripe', { method: 'POST', body: payload, headers: { 'stripe-signature': header } }));
    expect(res.status).toBe(200);
    const after = await getAdminOrder(boss.db, o.id);
    expect(after?.refund?.status).toBe('succeeded');
    expect(after?.stripeRefundId).toBe(refund.id);
  });
});
