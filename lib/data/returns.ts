import type { Db } from '../db/client';
import { localDayOf } from '../decision/tracking';
import type { Order, OrderReturn, ReturnReason, ReturnResolution, ReturnStatus } from '../types';
import { DataError, unwrap } from './errors';
import { toPickupPoint, type PickupRow } from './pickup';

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

export function isStoreFault(reason: ReturnReason): boolean {
  return STORE_FAULT_REASONS.includes(reason);
}

/** Refunded on the spot with nothing to send back: a package that didn't arrive, or a granted A-to-z Guarantee claim. */
export function nothingSentBack(reason: ReturnReason): boolean {
  return reason === 'not_received' || reason === 'atoz_claim';
}

type Row = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export function toReturn(json: unknown): OrderReturn {
  const r = json as Row;
  const refund = str(r.refund_status) as 'pending' | 'succeeded' | 'failed' | undefined;
  const shippedAt = str(r.replacement_shipped_at);
  const deliveredAt = str(r.replacement_delivered_at);
  return {
    id: String(r.id),
    orderId: String(r.order_id),
    status: r.status as ReturnStatus,
    reason: r.reason as ReturnReason,
    comment: str(r.comment),
    resolution: r.resolution === 'replacement' ? 'replacement' : 'refund',
    replacement: r.resolution === 'replacement' && shippedAt && deliveredAt ? { shippedAt, deliveredAt } : undefined,
    items: ((r.items ?? []) as Row[]).map((it) => ({
      productId: String(it.product_id),
      title: String(it.title ?? ''),
      image: String(it.image ?? ''),
      unitPriceMinor: Number(it.unit_price_minor ?? 0),
      qty: Number(it.qty ?? 0),
      ...(typeof it.size === 'string' && it.size ? { size: it.size } : {}),
    })),
    itemsMinor: Number(r.items_minor ?? 0),
    taxMinor: Number(r.tax_minor ?? 0),
    shipMinor: Number(r.ship_minor ?? 0),
    ...(Number(r.protection_minor ?? 0) ? { protectionMinor: Number(r.protection_minor) } : {}),
    ...(Number(r.wrap_minor ?? 0) ? { wrapMinor: Number(r.wrap_minor) } : {}),
    refundMinor: Number(r.refund_minor ?? 0),
    // absent before the split payment migration lands, and on returns refunded wholly to how they paid
    ...(Number(r.balance_refund_minor ?? 0) ? { balanceRefundMinor: Number(r.balance_refund_minor) } : {}),
    refund: refund ? { status: refund, refundedAt: str(r.refunded_at) } : undefined,
    ...(r.refund_to === 'balance' ? { refundToBalance: true } : {}),
    dropoffCode: String(r.dropoff_code ?? ''),
    dropoffBy: String(r.dropoff_by),
    ...(r.method === 'dropoff' && r.dropoff_point && typeof r.dropoff_point === 'object' ? { dropoffPoint: toPickupPoint(r.dropoff_point as PickupRow) } : {}),
    ...(r.method === 'pickup' && str(r.pickup_on) ? { pickupOn: str(r.pickup_on) } : {}),
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
  /** last moment to start a return of anything still left; absent until delivered */
  returnBy?: string;
  /**
   * product id → the last moment it can be returned: the order's window, or a replacement's own
   * window from when it was delivered, whichever ends later
   */
  returnByItem: Record<string, string>;
  /** product id → how many can be returned now (inside their window) */
  returnable: Record<string, number>;
  /** product id → how many can be replaced instead (not replaced before, on sale, in stock) */
  replaceable: Record<string, number>;
  returns: OrderReturn[];
}

const NONE: OrderReturns = { delivered: false, returnByItem: {}, returnable: {}, replaceable: {}, returns: [] };

const counts = (rows: unknown): Record<string, number> =>
  Object.fromEntries(((rows ?? []) as Row[]).map((it) => [String(it.product_id), Number(it.qty ?? 0)]));

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
    returnByItem: Object.fromEntries(((json.return_by_item ?? []) as Row[]).map((it) => [String(it.product_id), String(it.return_by)])),
    returnable: counts(json.returnable),
    replaceable: counts(json.replaceable),
    returns: ((json.returns ?? []) as Row[]).map(toReturn),
  };
}

/** Where an order's returns stand, for the orders list: the most pressing open or received one. */
export type ReturnSummary = 'requested' | 'replacement' | 'refund_pending' | 'refunded';

/** Return summaries for some of the caller's orders (RLS keeps it to their own). */
export async function returnSummaries(db: Db, orderIds: string[]): Promise<Map<string, ReturnSummary>> {
  const out = new Map<string, ReturnSummary>();
  if (!orderIds.length) return out;
  const { data, error } = await db.from('returns').select('order_id, status, refund_status, resolution').in('order_id', orderIds).in('status', ['requested', 'received']);
  if (error) return out; // a list chip isn't worth failing the page (or the table isn't deployed yet)
  const rank: Record<ReturnSummary, number> = { refunded: 0, replacement: 1, refund_pending: 2, requested: 3 };
  for (const r of data ?? []) {
    const s: ReturnSummary =
      r.resolution === 'replacement' ? 'replacement' : r.status === 'requested' ? 'requested' : r.refund_status === 'succeeded' ? 'refunded' : 'refund_pending';
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

/**
 * When what can be returned now has to go back by, soonest and latest. They differ once a
 * replacement, which gets its own window from its delivery, sits beside the order's other items.
 */
export function returnWindows(r: OrderReturns, now: Date = new Date()): { first: Date; last: Date } | null {
  const ends = Object.entries(r.returnable)
    .filter(([, n]) => n > 0)
    .map(([id]) => Date.parse(r.returnByItem[id] ?? r.returnBy ?? ''))
    .filter((t) => t >= now.getTime());
  return ends.length ? { first: new Date(Math.min(...ends)), last: new Date(Math.max(...ends)) } : null;
}

/** How long after it's marked delivered a missing package can be reported. */
export const NOT_RECEIVED_DAYS = 30;

/**
 * The last moment to report the order missing, or null when it can't be: not delivered yet, past
 * the window, something's been returned, or it was cash on delivery (nothing paid without it).
 */
export function reportMissingUntil(order: Order, r: OrderReturns | null, now: Date = new Date()): Date | null {
  if (order.status !== 'placed' || order.paymentMethod === 'cod' || !order.deliveredAt || !r) return null;
  const delivered = Date.parse(order.deliveredAt);
  const until = new Date(delivered + NOT_RECEIVED_DAYS * 86_400_000);
  if (delivered > now.getTime() || until.getTime() < now.getTime()) return null;
  return r.returns.every((x) => x.status === 'cancelled') ? until : null;
}

export interface ReturnInput {
  items?: unknown;
  reason?: unknown;
  comment?: unknown;
  /** 'refund' (the default) or 'replacement' */
  resolution?: unknown;
  /**
   * Where a refund goes: 'original' (the default), back to how the order was paid, or 'balance',
   * the shopper's balance in the store, paid in as soon as the items are received. Ignored for a
   * replacement and for orders paid from the balance, whose refunds go back to it anyway.
   */
  refundTo?: unknown;
}

/**
 * Start a return: `items` is [{productId, qty}]. The DB checks the window and quantities, and for a
 * replacement that the items haven't been replaced before and are in stock.
 */
export async function requestReturn(db: Db, orderId: string, input: ReturnInput): Promise<OrderReturn> {
  if (!isReturnReason(input.reason)) throw new DataError('invalid_input', 'reason', 'Choose why you’re returning it.');
  const resolution: ReturnResolution | null =
    input.resolution == null || input.resolution === '' || input.resolution === 'refund' ? 'refund' : input.resolution === 'replacement' ? 'replacement' : null;
  if (!resolution || (resolution === 'replacement' && !isStoreFault(input.reason))) {
    throw new DataError('invalid_input', 'resolution', 'Replacements are for items that arrived damaged, don’t work, are wrong, have parts missing or aren’t as described.');
  }
  const toBalance = input.refundTo === 'balance';
  if (!toBalance && input.refundTo != null && input.refundTo !== '' && input.refundTo !== 'original') {
    throw new DataError('invalid_input', 'refundTo', 'Choose where the refund goes: back to how you paid, or your balance.');
  }
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
    // left out for a refund, so a refund still works on a database without replacements
    ...(resolution === 'replacement' ? { p_resolution: resolution } : {}),
    // likewise left out for the original payment method
    ...(toBalance && resolution === 'refund' ? { p_refund_to: 'balance' } : {}),
  });
  if (res.error?.message === 'invalid_input' && res.error.details === 'items') {
    throw new DataError('invalid_input', 'items', 'Those items or quantities can’t be returned. Check what’s left to return.');
  }
  // the values were checked above: this is a Pay Later order, whose refunds only go back to Pay Later
  if (res.error?.message === 'invalid_input' && res.error.details === 'refund_to') {
    throw new DataError('invalid_input', 'refundTo', 'A Pay Later order’s refund goes back to Pay Later.');
  }
  if (res.error?.message === 'return_not_allowed' && res.error.details === 'replacement_only') {
    throw new DataError(
      'return_not_allowed',
      'replacement_only',
      'That item can only be replaced, if it arrived damaged, doesn’t work, is the wrong item, has parts missing or isn’t as described. It’s refunded only when it can’t be replaced.',
    );
  }
  return toReturn(unwrap(res));
}

/** Call off a return the store hasn't received yet. */
export async function cancelReturn(db: Db, returnId: string): Promise<OrderReturn> {
  if (!/^[0-9a-f-]{36}$/i.test(returnId)) throw new DataError('return_not_found');
  return toReturn(unwrap(await db.rpc('cancel_my_return', { p_return_id: returnId })));
}

/** The most days ahead a courier pickup of a return can be booked. */
export const RETURN_PICKUP_DAYS = 7;

/**
 * The days a courier can collect a return ("2026-10-09"…, in the store's time zone): from
 * tomorrow, a week at most and never past `until`, the drop-off deadline. choose_return_method
 * checks the same.
 */
export function returnPickupDays(timeZone: string, now: Date = new Date(), until?: string): string[] {
  const last = until ? localDayOf(until, timeZone) : null;
  const [y, m, d] = localDayOf(now.toISOString(), timeZone).split('-').map(Number);
  const days: string[] = [];
  for (let i = 1; i <= RETURN_PICKUP_DAYS; i++) {
    const day = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    if (last && day > last) break;
    days.push(day);
  }
  return days;
}

export interface ReturnMethodInput {
  /** 'dropoff' (the default) or 'pickup' */
  method?: unknown;
  /** dropping off: the Hub Locker or Hub Counter (blank: any drop-off point) */
  pickupPointId?: unknown;
  /** a pickup: the day, "2026-10-14" */
  pickupOn?: unknown;
}

const METHOD_ERROR: Record<string, string> = {
  method: 'Choose how it goes back: drop it off, or have it picked up from the delivery address.',
  pickup_point: 'Choose a drop-off point in this store.',
  pickup_on: 'Choose a pickup day from tomorrow until the drop-off deadline.',
};

const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

/**
 * How an open return goes back: dropped off (at a chosen Hub Locker or Hub Counter, or any
 * drop-off point) or collected from the delivery address on a day. It can change until the items
 * reach the store; an order collected from a pickup point can only be dropped off.
 */
export async function chooseReturnMethod(db: Db, returnId: string, input: ReturnMethodInput): Promise<OrderReturn> {
  if (!/^[0-9a-f-]{36}$/i.test(returnId)) throw new DataError('return_not_found');
  const method = input.method == null || input.method === '' ? 'dropoff' : input.method;
  if (method !== 'dropoff' && method !== 'pickup') throw new DataError('invalid_input', 'method', METHOD_ERROR.method);
  const point = typeof input.pickupPointId === 'string' ? input.pickupPointId.trim() : '';
  const day = typeof input.pickupOn === 'string' ? input.pickupOn.trim() : '';
  if (method === 'pickup' && !isDay(day)) throw new DataError('invalid_input', 'pickup_on', METHOD_ERROR.pickup_on);
  const res = await db.rpc('choose_return_method', {
    p_return_id: returnId,
    p_method: method,
    ...(method === 'dropoff' && point ? { p_point: point } : {}),
    ...(method === 'pickup' ? { p_pickup_on: day } : {}),
  });
  const detail = res.error?.message === 'invalid_input' ? res.error.details : '';
  if (detail && METHOD_ERROR[detail]) throw new DataError('invalid_input', detail, METHOD_ERROR[detail]);
  return toReturn(unwrap(res));
}
