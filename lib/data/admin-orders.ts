import 'server-only';
import type { CurrencyCode } from '../contracts';
import type { Db } from '../db/client';
import type { CancelReason, Market, Order, OrderStage, OrderStatus, PaymentMethod, RefundStatus } from '../types';
import { requireAdmin } from './admin-catalog';
import { DataError, unwrap } from './errors';
import { toOrder } from './map';
import { refundOrder } from './refunds';

/**
 * Orders for store admins (/admin/orders, /api/v1/admin/orders). Reads and moves go through
 * SECURITY DEFINER RPCs that check public.is_admin() (20260930120000_order_lifecycle.sql), so
 * there is no admin read policy on orders and shoppers' own queries stay scoped to them.
 * Card refunds are asked of Stripe server-side after the database cancels the order.
 */

export type AdminOrderFilter = 'all' | 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'refund_issues';

export const ADMIN_ORDER_FILTERS: readonly AdminOrderFilter[] = ['all', 'preparing', 'shipped', 'delivered', 'cancelled', 'refund_issues'];

export function orderFilter(v: unknown): AdminOrderFilter {
  return (ADMIN_ORDER_FILTERS as readonly unknown[]).includes(v) ? (v as AdminOrderFilter) : 'all';
}

export const ADMIN_ORDERS_PAGE_SIZE = 25;

export interface AdminCustomer {
  id?: string;
  email: string | null;
  name: string | null;
}

export interface AdminOrderSummary {
  id: string;
  status: OrderStatus;
  stage: OrderStage;
  currency: CurrencyCode;
  paymentMethod: PaymentMethod;
  paymentLabel: string;
  totalMinor: number;
  createdAt: string;
  placedAt?: string;
  cancelledAt?: string;
  cancelReason?: CancelReason;
  refundStatus?: RefundStatus;
  shipName: string;
  customer: AdminCustomer;
  itemCount: number;
  firstTitle: string | null;
}

export interface AdminOrderPage {
  orders: AdminOrderSummary[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<AdminOrderFilter, number>;
}

export interface AdminOrder extends Order {
  stage: OrderStage;
  customer: AdminCustomer;
  stripePaymentIntent?: string;
  stripeRefundId?: string;
}

type Row = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

function toSummary(r: Row): AdminOrderSummary {
  const c = (r.customer ?? {}) as Row;
  return {
    id: String(r.id),
    status: r.status as OrderStatus,
    stage: r.stage as OrderStage,
    currency: r.currency as CurrencyCode,
    paymentMethod: r.payment_method as PaymentMethod,
    paymentLabel: String(r.payment_label ?? ''),
    totalMinor: Number(r.total_minor ?? 0),
    createdAt: String(r.created_at),
    placedAt: str(r.placed_at),
    cancelledAt: str(r.cancelled_at),
    cancelReason: str(r.cancel_reason) as CancelReason | undefined,
    refundStatus: str(r.refund_status) as RefundStatus | undefined,
    shipName: String(r.ship_name ?? ''),
    customer: { email: str(c.email) ?? null, name: str(c.name) ?? null },
    itemCount: Number(r.item_count ?? 0),
    firstTitle: str(r.first_title) ?? null,
  };
}

function toAdminOrder(json: unknown): AdminOrder {
  const r = json as Row;
  const c = (r.customer ?? {}) as Row;
  return {
    ...toOrder(r as unknown as Parameters<typeof toOrder>[0]),
    stage: r.stage as OrderStage,
    customer: { id: str(c.id), email: str(c.email) ?? null, name: str(c.name) ?? null },
    stripePaymentIntent: str(r.stripe_payment_intent),
    stripeRefundId: str(r.stripe_refund_id),
  };
}

/** One page of a store's placed or charged orders, with per-filter counts (counts ignore the search). */
export async function listAdminOrders(
  db: Db,
  market: Market,
  opts: { filter?: AdminOrderFilter; q?: string; page?: number } = {},
): Promise<AdminOrderPage> {
  const json = unwrap(
    await db.rpc('admin_list_orders', {
      p_market: market,
      p_filter: opts.filter ?? 'all',
      p_q: opts.q?.trim() || undefined,
      p_page: Math.max(1, Math.floor(opts.page ?? 1)),
      p_page_size: ADMIN_ORDERS_PAGE_SIZE,
    }),
  ) as Row;
  const counts = (json.counts ?? {}) as Record<string, number>;
  return {
    orders: ((json.orders ?? []) as Row[]).map(toSummary),
    total: Number(json.total ?? 0),
    page: Number(json.page ?? 1),
    pageSize: Number(json.page_size ?? ADMIN_ORDERS_PAGE_SIZE),
    counts: Object.fromEntries(ADMIN_ORDER_FILTERS.map((f) => [f, Number(counts[f] ?? 0)])) as Record<AdminOrderFilter, number>,
  };
}

/** Any order, with its stage and customer; null when it doesn't exist. Non-admins get `forbidden`. */
export async function getAdminOrder(db: Db, id: string): Promise<AdminOrder | null> {
  try {
    return toAdminOrder(unwrap(await db.rpc('admin_get_order', { p_order_id: id })));
  } catch (err) {
    if (err instanceof DataError && err.code === 'order_not_found') return null;
    throw err;
  }
}

/** An order of `market` for the admin API: another store's orders are "not found" there. */
export async function getStoreOrder(db: Db, market: Market, id: string): Promise<AdminOrder> {
  const order = await getAdminOrder(db, id);
  if (!order || order.market !== market) throw new DataError('order_not_found');
  return order;
}

/** Ship now (the delivery days move up with it). Placed orders only; repeating is a no-op. */
export async function shipOrder(db: Db, id: string): Promise<AdminOrder> {
  return toAdminOrder(unwrap(await db.rpc('admin_ship_order', { p_order_id: id })));
}

/** Delivered now (any step still ahead happens now). Placed orders only; repeating is a no-op. */
export async function deliverOrder(db: Db, id: string): Promise<AdminOrder> {
  return toAdminOrder(unwrap(await db.rpc('admin_deliver_order', { p_order_id: id })));
}

async function refundIfCard(db: Db, order: AdminOrder): Promise<AdminOrder> {
  if (order.paymentMethod !== 'card' || order.refund?.status !== 'pending') return order;
  try {
    await refundOrder(order.id);
  } catch (err) {
    console.error('[admin orders] refund after cancel failed', order.id, err);
  }
  return (await getAdminOrder(db, order.id)) ?? order;
}

/**
 * Cancel any order that hasn't been delivered: stock goes back, a card payment is refunded on
 * Stripe. The cancel stands if the refund fails (`refund.status = 'failed'`; retry with retryRefund).
 */
export async function adminCancelOrder(db: Db, id: string): Promise<AdminOrder> {
  return refundIfCard(db, toAdminOrder(unwrap(await db.rpc('admin_cancel_order', { p_order_id: id }))));
}

/** Try a card refund again (failed, or pending without a Stripe refund). */
export async function retryRefund(db: Db, id: string): Promise<AdminOrder> {
  await requireAdmin(db);
  const order = await getAdminOrder(db, id);
  if (!order) throw new DataError('order_not_found');
  if (order.paymentMethod !== 'card' || !order.refund || (order.refund.status !== 'pending' && order.refund.status !== 'failed')) {
    return order;
  }
  const status = await refundOrder(id);
  if (status === 'failed') throw new DataError('refund_failed');
  return (await getAdminOrder(db, id)) ?? order;
}

/** Whether the detail page offers "Retry refund". */
export function canRetryRefund(order: AdminOrder): boolean {
  return order.paymentMethod === 'card' && (order.refund?.status === 'failed' || (order.refund?.status === 'pending' && !order.stripeRefundId));
}
