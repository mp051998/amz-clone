import 'server-only';
import type { CurrencyCode } from '../contracts';
import type { Db } from '../db/client';
import type { Market, OrderReturn, PaymentMethod } from '../types';
import type { AdminCustomer } from './admin-orders';
import { requireAdmin } from './admin-catalog';
import { DataError, unwrap } from './errors';
import { refundReturn } from './refunds';
import { toReturn } from './returns';

/**
 * Returns for store admins (/admin/returns, /api/v1/admin/returns). Receiving a return puts the
 * stock back and refunds it: card payments on Stripe (server-side, after the database records the
 * receipt), everything else at once. Rejecting closes it with an optional note to the shopper.
 */

export type AdminReturnFilter = 'open' | 'refund_issues' | 'closed' | 'all';
export const ADMIN_RETURN_FILTERS: readonly AdminReturnFilter[] = ['open', 'refund_issues', 'closed', 'all'];
export const ADMIN_RETURNS_PAGE_SIZE = 25;

export function returnFilter(v: unknown): AdminReturnFilter {
  return (ADMIN_RETURN_FILTERS as readonly unknown[]).includes(v) ? (v as AdminReturnFilter) : 'open';
}

export interface AdminReturn extends OrderReturn {
  order: {
    id: string;
    market: Market;
    currency: CurrencyCode;
    paymentMethod: PaymentMethod;
    paymentLabel: string;
    totalMinor: number;
    deliveredAt?: string;
  };
  customer: AdminCustomer;
  stripeRefundId?: string;
}

export interface AdminReturnPage {
  returns: AdminReturn[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<AdminReturnFilter, number>;
}

type Row = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

function toAdminReturn(json: unknown): AdminReturn {
  const r = json as Row;
  const o = (r.order ?? {}) as Row;
  const c = (r.customer ?? {}) as Row;
  return {
    ...toReturn(r),
    order: {
      id: String(o.id),
      market: o.market_id as Market,
      currency: o.currency as CurrencyCode,
      paymentMethod: o.payment_method as PaymentMethod,
      paymentLabel: String(o.payment_label ?? ''),
      totalMinor: Number(o.total_minor ?? 0),
      deliveredAt: str(o.delivered_at),
    },
    customer: { id: str(c.id), email: str(c.email) ?? null, name: str(c.name) ?? null },
    stripeRefundId: str(r.stripe_refund_id),
  };
}

const uuid = (id: string) => {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new DataError('return_not_found');
  return id;
};

/** One page of a store's returns with every filter's count. Open ones oldest first. */
export async function listAdminReturns(
  db: Db,
  market: Market,
  opts: { filter?: AdminReturnFilter; page?: number } = {},
): Promise<AdminReturnPage> {
  const json = unwrap(
    await db.rpc('admin_list_returns', {
      p_market: market,
      p_filter: opts.filter ?? 'open',
      p_page: Math.max(1, Math.floor(opts.page ?? 1)),
      p_page_size: ADMIN_RETURNS_PAGE_SIZE,
    }),
  ) as Row;
  const counts = (json.counts ?? {}) as Record<string, number>;
  return {
    returns: ((json.returns ?? []) as Row[]).map(toAdminReturn),
    total: Number(json.total ?? 0),
    page: Number(json.page ?? 1),
    pageSize: Number(json.page_size ?? ADMIN_RETURNS_PAGE_SIZE),
    counts: Object.fromEntries(ADMIN_RETURN_FILTERS.map((f) => [f, Number(counts[f] ?? 0)])) as Record<AdminReturnFilter, number>,
  };
}

/** A return of `market` (another store's is "not found"). Non-admins get `forbidden`. */
export async function getStoreReturn(db: Db, market: Market, id: string): Promise<AdminReturn> {
  const r = toAdminReturn(unwrap(await db.rpc('admin_get_return', { p_return_id: uuid(id) })));
  if (r.order.market !== market) throw new DataError('return_not_found');
  return r;
}

async function refundIfCard(db: Db, r: AdminReturn): Promise<AdminReturn> {
  if (r.order.paymentMethod !== 'card' || r.refund?.status !== 'pending') return r;
  try {
    await refundReturn(r.id);
  } catch (err) {
    console.error('[admin returns] refund after receipt failed', r.id, err);
  }
  return toAdminReturn(unwrap(await db.rpc('admin_get_return', { p_return_id: r.id })));
}

/** The items are back: stock returned, refund issued (card: on Stripe; if that fails, retry later). */
export async function receiveReturn(db: Db, id: string): Promise<AdminReturn> {
  return refundIfCard(db, toAdminReturn(unwrap(await db.rpc('admin_receive_return', { p_return_id: uuid(id) }))));
}

/** Close a return without a refund, with an optional note the shopper sees. */
export async function rejectReturn(db: Db, id: string, note?: unknown): Promise<AdminReturn> {
  const text = typeof note === 'string' ? note.trim() : '';
  if (text.length > 500) throw new DataError('invalid_input', 'note', 'Keep the note under 500 characters.');
  return toAdminReturn(unwrap(await db.rpc('admin_reject_return', { p_return_id: uuid(id), p_note: text || undefined })));
}

/** Try a return's card refund again (failed, or pending without a Stripe refund). */
export async function retryReturnRefund(db: Db, id: string): Promise<AdminReturn> {
  await requireAdmin(db);
  const r = toAdminReturn(unwrap(await db.rpc('admin_get_return', { p_return_id: uuid(id) })));
  if (!canRetryReturnRefund(r)) return r;
  const status = await refundReturn(r.id);
  if (status === 'failed') throw new DataError('refund_failed');
  return toAdminReturn(unwrap(await db.rpc('admin_get_return', { p_return_id: r.id })));
}

export function canRetryReturnRefund(r: AdminReturn): boolean {
  return r.order.paymentMethod === 'card' && (r.refund?.status === 'failed' || (r.refund?.status === 'pending' && !r.stripeRefundId));
}
