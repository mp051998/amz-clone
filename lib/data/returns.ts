import type { Db } from '../db/client';
import type { OrderReturn, ReturnReason, ReturnStatus } from '../types';
import { DataError, unwrap } from './errors';

/**
 * Returns of delivered orders (20261004090000_returns.sql). The database owns the rules: the
 * store's return window, what's still returnable, the refund amount (items, their share of tax,
 * and of delivery when the store was at fault) and who may do what.
 */

export const RETURN_REASONS: readonly ReturnReason[] = [
  'no_longer_needed',
  'bought_by_mistake',
  'better_price',
  'damaged',
  'defective',
  'wrong_item',
  'missing_parts',
  'not_as_described',
];

/** Reasons where the store got it wrong: the delivery charge share is refunded too. */
export const STORE_FAULT_REASONS: readonly ReturnReason[] = ['damaged', 'defective', 'wrong_item', 'missing_parts', 'not_as_described'];

export function isReturnReason(v: unknown): v is ReturnReason {
  return (RETURN_REASONS as readonly unknown[]).includes(v);
}

type Row = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export function toReturn(json: unknown): OrderReturn {
  const r = json as Row;
  const refund = str(r.refund_status) as 'pending' | 'succeeded' | 'failed' | undefined;
  return {
    id: String(r.id),
    orderId: String(r.order_id),
    status: r.status as ReturnStatus,
    reason: r.reason as ReturnReason,
    comment: str(r.comment),
    items: ((r.items ?? []) as Row[]).map((it) => ({
      productId: String(it.product_id),
      title: String(it.title ?? ''),
      image: String(it.image ?? ''),
      unitPriceMinor: Number(it.unit_price_minor ?? 0),
      qty: Number(it.qty ?? 0),
    })),
    itemsMinor: Number(r.items_minor ?? 0),
    taxMinor: Number(r.tax_minor ?? 0),
    shipMinor: Number(r.ship_minor ?? 0),
    refundMinor: Number(r.refund_minor ?? 0),
    refund: refund ? { status: refund, refundedAt: str(r.refunded_at) } : undefined,
    dropoffCode: String(r.dropoff_code ?? ''),
    dropoffBy: String(r.dropoff_by),
    rejectNote: str(r.reject_note),
    createdAt: String(r.created_at),
    receivedAt: str(r.received_at),
    rejectedAt: str(r.rejected_at),
    cancelledAt: str(r.cancelled_at),
  };
}

export interface OrderReturns {
  /** delivered (and not cancelled) */
  delivered: boolean;
  /** last moment to start a return; absent until delivered */
  returnBy?: string;
  /** product id → how many can still be returned */
  returnable: Record<string, number>;
  returns: OrderReturn[];
}

const NONE: OrderReturns = { delivered: false, returnable: {}, returns: [] };

/** The returns side of one of the caller's orders; null when it isn't theirs. */
export async function getOrderReturns(db: Db, orderId: string): Promise<OrderReturns | null> {
  const res = await db.rpc('order_returns', { p_order_id: orderId });
  // PGRST202: the returns migration hasn't reached this database yet
  if (res.error?.code === 'PGRST202') return NONE;
  const json = unwrap(res) as Row | null;
  if (!json) return null;
  return {
    delivered: json.delivered === true,
    returnBy: str(json.return_by),
    returnable: Object.fromEntries(((json.returnable ?? []) as Row[]).map((it) => [String(it.product_id), Number(it.qty ?? 0)])),
    returns: ((json.returns ?? []) as Row[]).map(toReturn),
  };
}

/** Where an order's returns stand, for the orders list: the most pressing open or received one. */
export type ReturnSummary = 'requested' | 'refund_pending' | 'refunded';

/** Return summaries for some of the caller's orders (RLS keeps it to their own). */
export async function returnSummaries(db: Db, orderIds: string[]): Promise<Map<string, ReturnSummary>> {
  const out = new Map<string, ReturnSummary>();
  if (!orderIds.length) return out;
  const { data, error } = await db.from('returns').select('order_id, status, refund_status').in('order_id', orderIds).in('status', ['requested', 'received']);
  if (error) return out; // a list chip isn't worth failing the page (or the table isn't deployed yet)
  const rank: Record<ReturnSummary, number> = { refunded: 0, refund_pending: 1, requested: 2 };
  for (const r of data ?? []) {
    const s: ReturnSummary = r.status === 'requested' ? 'requested' : r.refund_status === 'succeeded' ? 'refunded' : 'refund_pending';
    const cur = out.get(r.order_id);
    if (!cur || rank[s] > rank[cur]) out.set(r.order_id, s);
  }
  return out;
}

/** Whether a return can be started now: delivered, inside the window, something left. */
export function canStartReturn(r: OrderReturns, now: Date = new Date()): boolean {
  return (
    r.delivered &&
    !!r.returnBy &&
    Date.parse(r.returnBy) >= now.getTime() &&
    Object.values(r.returnable).some((n) => n > 0)
  );
}

export interface ReturnInput {
  items?: unknown;
  reason?: unknown;
  comment?: unknown;
}

/** Start a return: `items` is [{productId, qty}]. The DB checks the window and quantities. */
export async function requestReturn(db: Db, orderId: string, input: ReturnInput): Promise<OrderReturn> {
  if (!isReturnReason(input.reason)) throw new DataError('invalid_input', 'reason', 'Choose why you’re returning it.');
  const comment = typeof input.comment === 'string' ? input.comment.trim() : '';
  if (comment.length > 1000) throw new DataError('invalid_input', 'comment', 'Keep the comment under 1,000 characters.');
  const items = (Array.isArray(input.items) ? input.items : [])
    .map((it) => it as Row)
    .map((it) => ({ product_id: String(it?.productId ?? ''), qty: Number(it?.qty) }))
    .filter((it) => it.product_id && Number.isInteger(it.qty) && it.qty > 0);
  if (!items.length) throw new DataError('invalid_input', 'items', 'Choose at least one item to return.');
  const res = await db.rpc('request_return', {
    p_order_id: orderId,
    p_items: items,
    p_reason: input.reason,
    p_comment: comment || undefined,
  });
  if (res.error?.message === 'invalid_input' && res.error.details === 'items') {
    throw new DataError('invalid_input', 'items', 'Those items or quantities can’t be returned. Check what’s left to return.');
  }
  return toReturn(unwrap(res));
}

/** Call off a return the store hasn't received yet. */
export async function cancelReturn(db: Db, returnId: string): Promise<OrderReturn> {
  if (!/^[0-9a-f-]{36}$/i.test(returnId)) throw new DataError('return_not_found');
  return toReturn(unwrap(await db.rpc('cancel_my_return', { p_return_id: returnId })));
}
