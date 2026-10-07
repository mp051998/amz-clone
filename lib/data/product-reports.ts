import type { Db } from '../db/client';
import { isReportReason, reportInputError, type ProductReportReason } from '../product-reports';
import type { Market } from '../types';
import { DataError, unwrap } from './errors';

/**
 * "Report an issue with this product" (20261106090000_product_reports.sql): shoppers report a
 * listing through report_product, one open report each per product; admins work a store's
 * reports at /admin/product-reports and resolve or dismiss them through resolve_product_report.
 */

export type ProductReportStatus = 'open' | 'resolved' | 'dismissed';

export interface ProductReport {
  id: string;
  productId: string;
  reason: ProductReportReason;
  details: string | null;
  status: ProductReportStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

type Row = Record<string, unknown>;

const REPORT_COLS = 'id, product_id, reason, details, status, created_at, updated_at, resolved_at, resolution_note';

function toReport(r: Row): ProductReport {
  return {
    id: String(r.id),
    productId: String(r.product_id),
    reason: isReportReason(r.reason) ? r.reason : 'other',
    details: typeof r.details === 'string' ? r.details : null,
    status: r.status === 'resolved' || r.status === 'dismissed' ? r.status : 'open',
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at ?? r.created_at),
    resolvedAt: typeof r.resolved_at === 'string' ? r.resolved_at : null,
    resolutionNote: typeof r.resolution_note === 'string' ? r.resolution_note : null,
  };
}

/**
 * Report an issue with a product (signed in). Reporting again while the caller's report on it is
 * open rewrites that report (`updated`).
 */
export async function reportProduct(db: Db, productId: string, input: { reason: unknown; details?: unknown }): Promise<{ report: ProductReport; updated: boolean }> {
  const details = typeof input.details === 'string' ? input.details.trim() : '';
  const bad = reportInputError(input.reason, details);
  if (bad) throw new DataError('invalid_input', bad.field, bad.message);
  const json = unwrap(
    await db.rpc('report_product', { p_product: productId, p_reason: input.reason as string, ...(details ? { p_details: details } : {}) }),
  ) as Row;
  return { report: toReport(json), updated: json.updated === true };
}

/** The caller's open report on a product, if they have one. */
export async function myOpenReport(db: Db, productId: string, userId: string): Promise<ProductReport | null> {
  const row = unwrap(
    await db.from('product_reports').select(REPORT_COLS).eq('product_id', productId).eq('user_id', userId).eq('status', 'open').maybeSingle(),
  ) as Row | null;
  return row ? toReport(row) : null;
}

// ---------------------------------------------------------------------------
// admins
// ---------------------------------------------------------------------------

export type ProductReportView = 'open' | 'closed' | 'all';
export const PRODUCT_REPORT_VIEWS: readonly ProductReportView[] = ['open', 'closed', 'all'];
export const PRODUCT_REPORT_PAGE_SIZE = 25;

export function productReportView(v: unknown): ProductReportView {
  return (PRODUCT_REPORT_VIEWS as readonly unknown[]).includes(v) ? (v as ProductReportView) : 'open';
}

export interface QueuedProductReport extends ProductReport {
  reporter: string;
  productTitle: string;
  productArchived: boolean;
}

export interface ProductReportQueuePage {
  reports: QueuedProductReport[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<ProductReportView, number>;
}

const QUEUE_COLS = `${REPORT_COLS}, reporter_name, products!inner(market_id, title, archived_at)`;

/** One page of a store's product reports: open ones oldest first (the next to look at on top), closed ones latest first. */
export async function listProductReportQueue(
  db: Db,
  market: Market,
  opts: { view?: ProductReportView; page?: number } = {},
): Promise<ProductReportQueuePage> {
  const view = opts.view ?? 'open';
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const from = (page - 1) * PRODUCT_REPORT_PAGE_SIZE;
  const inView = <Q extends { eq: (c: string, v: string) => Q; neq: (c: string, v: string) => Q }>(q: Q, v: ProductReportView): Q =>
    v === 'open' ? q.eq('status', 'open') : v === 'closed' ? q.neq('status', 'open') : q;
  const count = (v: ProductReportView) =>
    inView(db.from('product_reports').select('id, products!inner(market_id)', { count: 'exact', head: true }).eq('products.market_id', market), v);

  const [res, open, closed, all] = await Promise.all([
    inView(db.from('product_reports').select(QUEUE_COLS, { count: 'exact' }).eq('products.market_id', market), view)
      .order(view === 'open' ? 'created_at' : 'updated_at', { ascending: view === 'open' })
      .order('id')
      .range(from, from + PRODUCT_REPORT_PAGE_SIZE - 1),
    count('open'),
    count('closed'),
    count('all'),
  ]);
  const rows = (unwrap(res) ?? []) as unknown as Row[];
  return {
    reports: rows.map((r) => {
      const p = (r.products as Row | null) ?? {};
      return { ...toReport(r), reporter: String(r.reporter_name ?? ''), productTitle: String(p.title ?? ''), productArchived: p.archived_at != null };
    }),
    total: res.count ?? rows.length,
    page,
    pageSize: PRODUCT_REPORT_PAGE_SIZE,
    counts: { open: open.count ?? 0, closed: closed.count ?? 0, all: all.count ?? 0 },
  };
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Whether a report is about a product of `market` (admin pages are per store). */
export async function assertStoreReport(db: Db, market: Market, id: string): Promise<void> {
  if (!UUID.test(id)) throw new DataError('report_not_found');
  const row = unwrap(
    await db.from('product_reports').select('id, products!inner(market_id)').eq('id', id).eq('products.market_id', market).maybeSingle(),
  );
  if (!row) throw new DataError('report_not_found');
}

/** An admin closes an open report: resolved (the listing was fixed) or dismissed, with an optional note (up to 500 characters). */
export async function resolveProductReport(db: Db, id: string, status: unknown, note?: unknown): Promise<ProductReport> {
  if (status !== 'resolved' && status !== 'dismissed') throw new DataError('invalid_input', 'status', 'Resolve or dismiss the report.');
  const text = typeof note === 'string' ? note.trim() : '';
  if (text.length > 500) throw new DataError('invalid_input', 'note', 'Keep the note under 500 characters.');
  const json = unwrap(await db.rpc('resolve_product_report', { p_report: id, p_status: status, ...(text ? { p_note: text } : {}) }));
  return toReport(json as Row);
}
