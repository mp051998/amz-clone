import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setCartQty } from '@/lib/data/cart';
import { canRetryRefund, getAdminOrder } from '@/lib/data/admin-orders';
import { balanceHistory } from '@/lib/data/balance';
import { DataError } from '@/lib/data/errors';
import { listInbox } from '@/lib/data/inbox';
import { cancelOrderItems, getOrder, listOrders, placeOrder } from '@/lib/data/orders';
import { refundCancellation, type RefundStripe } from '@/lib/data/refunds';
import { getOrderReturns } from '@/lib/data/returns';
import { listTransactions } from '@/lib/data/transactions';
import { stripe } from '@/lib/stripe';
import type { Market, PaymentMethod } from '@/lib/types';
import { admin, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, pickProduct, stockOf, US_SHIPPING, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

let buyer: TestUser;
let other: TestUser;
let boss: TestUser;

beforeAll(async () => {
  [buyer, other, boss] = await Promise.all([newUser('Cancel Items Buyer'), newUser('Cancel Items Other'), newUser('Cancel Items Admin')]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
});

afterAll(async () => {
  await Promise.all([deleteUser(buyer), deleteUser(other), deleteUser(boss)]);
});

/** `buyer` orders `qtys[i]` of the products at `offsets[i]`. */
async function order(market: Market, method: PaymentMethod, offsets: number[], qtys: number[] = offsets.map(() => 1)) {
  const products = await Promise.all(offsets.map((o) => pickProduct(market, o)));
  await buyer.db.rpc('cart_clear', { p_market: market });
  for (const [i, p] of products.entries()) await setCartQty(buyer.db, market, p.id, qtys[i]);
  const o = await placeOrder(buyer.db, market, { paymentMethod: method, shipping: market === 'IN' ? IN_SHIPPING : US_SHIPPING });
  return { products, order: o };
}

async function taxRate(market: Market): Promise<number> {
  const { data } = await admin().from('markets').select('tax_rate_bps, tax_inclusive').eq('id', market).single();
  return data!.tax_inclusive ? 0 : data!.tax_rate_bps;
}

describe('cancel items', () => {
  it('cancels some lines: the rest repriced, stock back, the store balance refunded at once', async () => {
    const { products: [a, b, c], order: o } = await order('US', 'giftcard', [69, 70, 71], [1, 2, 1]);
    const stockB = await stockOf(b.id);
    const bps = await taxRate('US');

    const price = (id: string) => o.items.find((i) => i.productId === id)!.unitPriceMinor;
    const done = await cancelOrderItems(buyer.db, o.id, [b.id]);
    expect(done.status).toBe('placed');
    expect(done.items.map((i) => i.productId)).toEqual([a.id, c.id]);
    const sub = price(a.id) + price(c.id);
    const tax = Math.min(o.totals.taxMinor, Math.round((sub * bps) / 10000));
    expect(done.totals).toEqual({ subtotalMinor: sub, discountMinor: 0, shipMinor: o.totals.shipMinor, taxMinor: tax, totalMinor: sub + o.totals.shipMinor + tax });
    expect(done.cancellations).toHaveLength(1);
    const [cx] = done.cancellations!;
    expect(cx.items).toEqual([expect.objectContaining({ productId: b.id, qty: 2, unitPriceMinor: price(b.id) })]);
    expect(cx).toMatchObject({ itemsMinor: price(b.id) * 2, taxMinor: o.totals.taxMinor - tax });
    expect(cx.refund).toMatchObject({ status: 'succeeded', amountMinor: o.totals.totalMinor - done.totals.totalMinor });
    expect(cx.refund.refundedAt).toBeTruthy();
    expect(await stockOf(b.id)).toBe(stockB + 2);
    expect((await balanceHistory(buyer.db, 'US'))[0]).toMatchObject({ kind: 'refund', orderId: o.id, amountMinor: cx.refund.amountMinor });

    // the order reads the same from the table, the list and the admin's view
    expect((await getOrder(buyer.db, o.id))?.cancellations).toEqual(done.cancellations);
    expect((await listOrders(buyer.db, 'US')).find((x) => x.id === o.id)?.cancellations).toEqual(done.cancellations);
    expect((await getAdminOrder(boss.db, o.id))?.cancellations).toEqual(done.cancellations);

    // what was charged is the order as placed, with the cancelled items refunded on their own
    const txns = (await listTransactions(buyer.db, 'US', buyer.id)).filter((t) => t.orderId === o.id);
    expect(txns.map((t) => `${t.kind} ${t.amountMinor}`).sort()).toEqual([`charge ${o.totals.totalMinor}`, `refund ${cx.refund.amountMinor}`].sort());

    // the shopper's messages say which items went and what came back for them
    const inbox = (await listInbox(buyer.db, 'US', buyer.id)).filter((m) => m.orderId === o.id && m.kind.startsWith('items_'));
    expect(inbox.map((m) => m.kind).sort()).toEqual(['items_cancelled', 'items_refunded']);
    expect(inbox.every((m) => m.subject === cx.items[0].title)).toBe(true);
    expect(inbox.find((m) => m.kind === 'items_refunded')?.amountMinor).toBe(cx.refund.amountMinor);

    // the rest too: that's the whole order, refunded what was left
    const all = await cancelOrderItems(buyer.db, o.id, [a.id, c.id]);
    expect(all).toMatchObject({ status: 'cancelled', cancelReason: 'customer' });
    expect(all.refund).toMatchObject({ status: 'succeeded', amountMinor: done.totals.totalMinor });
    expect(all.cancellations).toHaveLength(1);
    expect((await balanceHistory(buyer.db, 'US'))[0]).toMatchObject({ kind: 'refund', orderId: o.id, amountMinor: done.totals.totalMinor });
  });

  it('cash on delivery was never charged; what’s left can be returned once delivered', async () => {
    const { products: [a, b], order: o } = await order('IN', 'cod', [51, 52]);
    const price = o.items.find((i) => i.productId === a.id)!.unitPriceMinor;
    const done = await cancelOrderItems(buyer.db, o.id, [a.id]);
    expect(done.cancellations![0].refund).toEqual({ status: 'not_charged', amountMinor: price });
    expect(done.totals.totalMinor).toBe(o.totals.totalMinor - price);

    await deliveredDaysAgo(o.id, 1);
    const returns = await getOrderReturns(buyer.db, o.id);
    expect(returns?.returnable).toEqual({ [b.id]: 1 });
  });

  it('refuses none, a product not in the order, someone else’s order, and a shipped one', async () => {
    const { products: [a, b], order: o } = await order('US', 'giftcard', [69, 70]);
    const stranger = await pickProduct('US', 71);
    expect(await code(cancelOrderItems(buyer.db, o.id, []))).toBe('invalid_input');
    const empty = await buyer.db.rpc('cancel_my_items', { p_order_id: o.id, p_product_ids: [] });
    expect(empty.error?.message).toBe('invalid_input');
    expect(await code(cancelOrderItems(buyer.db, o.id, [a.id, stranger.id]))).toBe('invalid_input');
    expect(await code(cancelOrderItems(other.db, o.id, [a.id]))).toBe('order_not_found');
    expect((await getOrder(buyer.db, o.id))?.items).toHaveLength(2);

    const { data } = await admin().from('orders').select('placed_at, shipped_at').eq('id', o.id).single();
    await admin().from('orders').update({ placed_at: iso(Date.parse(data!.placed_at!) - 30 * HOUR), shipped_at: iso(Date.now() - HOUR) }).eq('id', o.id);
    expect(await code(cancelOrderItems(buyer.db, o.id, [b.id]))).toBe('order_not_cancellable');
    expect((await getOrder(buyer.db, o.id))?.cancellations).toBeUndefined();
  });

  it('only the owner sees cancelled items, and nobody writes them but the RPCs', async () => {
    const { products: [a], order: o } = await order('US', 'giftcard', [69, 70]);
    const done = await cancelOrderItems(buyer.db, o.id, [a.id]);
    const id = done.cancellations![0].id;
    expect((await other.db.from('order_cancellations').select('id').eq('order_id', o.id)).data).toEqual([]);
    expect((await other.db.from('order_cancelled_items').select('product_id').eq('order_id', o.id)).data).toEqual([]);
    const forged = await buyer.db.from('order_cancellations').insert({ order_id: o.id, items_minor: 1, refund_status: 'succeeded' });
    expect(forged.error).toBeTruthy();
    const raised = await buyer.db.from('order_cancellations').update({ items_minor: 99_999 }).eq('id', id).select();
    expect(raised.data ?? []).toEqual([]);
    const recorded = await buyer.db.rpc('record_cancellation_refund', { p_cancellation_id: id, p_refund_id: 're_x', p_status: 'failed' });
    expect(recorded.error).toBeTruthy();
  });

  it('a card order’s items are refunded on Stripe, and the refund settles like an order’s', async () => {
    const fake = (): RefundStripe => ({
      refunds: {
        list: async () => ({ data: [] }),
        create: async () => ({ id: 're_items', status: 'pending' }),
      },
      checkout: { sessions: { retrieve: async () => ({ payment_intent: null }) } },
    });
    const { products: [a], order: o } = await order('US', 'card', [72, 73]);
    const svc = admin();
    await svc.from('orders').update({ status: 'placed', placed_at: iso(Date.now()), payment_label: 'Visa ending 4242' }).eq('id', o.id);

    // no PaymentIntent on record: with Stripe set up the attempt fails; without it (CI) the refund waits
    const done = await cancelOrderItems(buyer.db, o.id, [a.id]);
    const cx = done.cancellations![0];
    expect(cx.refund.status).toBe(stripe ? 'failed' : 'pending');
    if (stripe) expect(canRetryRefund((await getAdminOrder(boss.db, o.id))!)).toBe(true);

    await svc.rpc('record_payment_intent', { p_order_id: o.id, p_payment_intent: 'pi_fake' });
    expect(await refundCancellation(cx.id, { db: svc, stripe: fake() })).toBe('pending');
    const read = async () => (await svc.from('order_cancellations').select('refund_status, stripe_refund_id, refunded_at').eq('id', cx.id).single()).data!;
    expect(await read()).toMatchObject({ refund_status: 'pending', stripe_refund_id: 're_items' });

    await svc.rpc('record_cancellation_refund', { p_cancellation_id: cx.id, p_refund_id: 're_old', p_status: 'failed' });
    expect((await read()).refund_status).toBe('pending'); // failure of some other refund: ignored
    await svc.rpc('record_cancellation_refund', { p_cancellation_id: cx.id, p_refund_id: 're_items', p_status: 'succeeded' });
    await svc.rpc('record_cancellation_refund', { p_cancellation_id: cx.id, p_refund_id: 're_items', p_status: 'pending' });
    const settled = await read();
    expect(settled.refund_status).toBe('succeeded');
    expect(settled.refunded_at).toBeTruthy();
    expect(await refundCancellation(cx.id, { db: svc, stripe: fake() })).toBe('succeeded');
    expect(canRetryRefund((await getAdminOrder(boss.db, o.id))!)).toBe(false);
  });
});
