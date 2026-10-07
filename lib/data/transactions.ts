import type { Db } from '../db/client';
import type { Market, Order, PaymentMethod } from '../types';
import { unwrap } from './errors';
import { listGiftCardPurchases, type GiftCardPurchase } from './gift-card-purchases';
import { listOrders } from './orders';

/**
 * "Your transactions": every charge and refund in a store, newest first, built from what the
 * store already keeps: orders (charged when placed, or on delivery for cash on delivery),
 * refunds for cancelled orders, cancelled items and received returns, and gift card purchases.
 */

export type TransactionStatus = 'completed' | 'pending' | 'failed' | 'due';

export interface Transaction {
  /** stable and unique: `order:<id>`, `cancel:<id>`, `cancel-items:<id>`, `return:<id>` or `gift:<id>` */
  key: string;
  kind: 'charge' | 'refund';
  source: 'order' | 'cancellation' | 'return' | 'gift_card';
  amountMinor: number;
  at: string;
  /** `due`: cash on delivery not delivered yet */
  status: TransactionStatus;
  method: PaymentMethod;
  paymentLabel: string;
  orderId?: string;
}

/** A received return's refund. */
export interface ReturnRefund {
  id: string;
  orderId: string;
  amountMinor: number;
  status: 'pending' | 'succeeded' | 'failed';
  at: string;
  method: PaymentMethod;
  paymentLabel: string;
}

const refundStatus = (s: string): TransactionStatus => (s === 'succeeded' ? 'completed' : s === 'pending' ? 'pending' : 'failed');

function orderTransactions(o: Order, now: Date): Transaction[] {
  const out: Transaction[] = [];
  const base = { method: o.paymentMethod, paymentLabel: o.paymentLabel, orderId: o.id };
  const cancelled = (o.cancellations ?? []).filter((c) => c.refund.status !== 'not_charged' && c.refund.amountMinor > 0);
  const total = o.totals.totalMinor;
  // what was charged when placed: the order as it is now plus the items cancelled since
  const charged = total + cancelled.reduce((sum, c) => sum + c.refund.amountMinor, 0);
  if (o.paymentMethod === 'cod') {
    const delivered = o.deliveredAt && Date.parse(o.deliveredAt) <= now.getTime() ? o.deliveredAt : null;
    if (delivered) out.push({ ...base, key: `order:${o.id}`, kind: 'charge', source: 'order', amountMinor: total, at: delivered, status: 'completed' });
    else if (o.status !== 'cancelled') out.push({ ...base, key: `order:${o.id}`, kind: 'charge', source: 'order', amountMinor: total, at: o.placedAt ?? o.createdAt, status: 'due' });
  } else if (o.refund?.status !== 'not_charged' && charged > 0) {
    // a card payment that arrived after the stock sold out was charged (and refunded) unplaced
    out.push({ ...base, key: `order:${o.id}`, kind: 'charge', source: 'order', amountMinor: charged, at: o.placedAt ?? o.createdAt, status: 'completed' });
  }
  for (const c of cancelled) {
    out.push({
      ...base,
      key: `cancel-items:${c.id}`,
      kind: 'refund',
      source: 'cancellation',
      amountMinor: c.refund.amountMinor,
      at: c.refund.refundedAt ?? c.createdAt,
      status: refundStatus(c.refund.status),
    });
  }
  if (o.refund && o.refund.status !== 'not_charged' && o.refund.amountMinor > 0) {
    out.push({
      ...base,
      key: `cancel:${o.id}`,
      kind: 'refund',
      source: 'cancellation',
      amountMinor: o.refund.amountMinor,
      at: o.refund.refundedAt ?? o.cancelledAt ?? o.createdAt,
      status: refundStatus(o.refund.status),
    });
  }
  return out;
}

/** Newest first; on the same instant a refund sorts above the charge it gives back. */
export function buildTransactions(orders: Order[], returns: ReturnRefund[], giftCards: GiftCardPurchase[], now: Date = new Date()): Transaction[] {
  const all: Transaction[] = [
    ...orders.flatMap((o) => orderTransactions(o, now)),
    ...returns
      .filter((r) => r.amountMinor > 0)
      .map((r): Transaction => ({
        key: `return:${r.id}`,
        kind: 'refund',
        source: 'return',
        amountMinor: r.amountMinor,
        at: r.at,
        status: refundStatus(r.status),
        method: r.method,
        paymentLabel: r.paymentLabel,
        orderId: r.orderId,
      })),
    ...giftCards
      .filter((g) => g.status === 'paid')
      .map((g): Transaction => ({
        key: `gift:${g.id}`,
        kind: 'charge',
        source: 'gift_card',
        amountMinor: g.amountMinor,
        at: g.paidAt ?? g.createdAt,
        status: 'completed',
        method: 'card',
        paymentLabel: 'Card',
      })),
  ];
  return all.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (a.kind === b.kind ? 0 : a.kind === 'refund' ? -1 : 1));
}

type ReturnRow = {
  id: string;
  order_id: string;
  refund_minor: number;
  refund_status: string | null;
  refunded_at: string | null;
  received_at: string | null;
  orders: { payment_method: string; payment_label: string };
};

/** The caller's refunds for received returns in a store, newest first. */
async function returnRefunds(db: Db, market: Market, userId: string): Promise<ReturnRefund[]> {
  const rows = unwrap(
    await db
      .from('returns')
      .select('id, order_id, refund_minor, refund_status, refunded_at, received_at, orders!inner(market_id, payment_method, payment_label)')
      .eq('user_id', userId)
      .eq('orders.market_id', market)
      .eq('status', 'received')
      .gt('refund_minor', 0)
      .order('received_at', { ascending: false })
      .limit(200),
  ) as unknown as ReturnRow[];
  return rows.map((r) => ({
    id: r.id,
    orderId: r.order_id,
    amountMinor: r.refund_minor,
    status: (r.refund_status ?? 'pending') as ReturnRefund['status'],
    at: r.refunded_at ?? r.received_at ?? '',
    method: r.orders.payment_method as PaymentMethod,
    paymentLabel: r.orders.payment_label,
  }));
}

/** The caller's charges and refunds in a store, newest first (the latest 200 orders' worth). */
export async function listTransactions(db: Db, market: Market, userId: string, now: Date = new Date()): Promise<Transaction[]> {
  const [orders, returns, giftCards] = await Promise.all([
    listOrders(db, market, { limit: 200 }),
    returnRefunds(db, market, userId),
    listGiftCardPurchases(db, market, 50),
  ]);
  return buildTransactions(orders, returns, giftCards, now);
}
