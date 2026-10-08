import type { Db } from '../db/client';
import type { Market } from '../types';
import { checkLowerPrice, reportTotal, type PriceReport } from '../lower-price';
import { DataError, unwrap } from './errors';

/**
 * "Would you like to tell us about a lower price?" (20270102090000_lower_price_reports.sql):
 * shoppers tell the store where they saw a product for less through report_lower_price, one open
 * report each per product; admins see each product's reports together at
 * /admin/product-reports/lower-prices and mark them reviewed through review_price_reports.
 */

type Row = Record<string, unknown>;

const REPORT_COLS = 'id, product_id, our_price_minor, seen_at, url, store_name, city, seen_on, price_minor, shipping_minor, status, created_at, updated_at, reviewed_at';

function toReport(r: Row): PriceReport {
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    id: String(r.id),
    productId: String(r.product_id),
    ourPriceMinor: Number(r.our_price_minor),
    seenAt: r.seen_at === 'store' ? 'store' : 'online',
    url: str(r.url),
    storeName: str(r.store_name),
    city: str(r.city),
    seenOn: str(r.seen_on),
    priceMinor: Number(r.price_minor),
    shippingMinor: Number(r.shipping_minor ?? 0),
    status: r.status === 'reviewed' ? 'reviewed' : 'open',
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at ?? r.created_at),
    reviewedAt: str(r.reviewed_at),
  };
}

/**
 * Tell the store about a lower price (signed in). Telling it again while the caller's report on
 * the product is open rewrites that report (`updated`). `invalid_input` (detail: the field) for
 * anything `checkLowerPrice` refuses, the price included when it isn't lower than the product's.
 */
export async function reportLowerPrice(db: Db, productId: string, raw: Parameters<typeof checkLowerPrice>[0]): Promise<{ report: PriceReport; updated: boolean }> {
  const checked = checkLowerPrice(raw);
  if ('field' in checked) throw new DataError('invalid_input', checked.field, checked.message);
  const i = checked.input;
  const res = await db.rpc('report_lower_price', {
    p_product: productId,
    p_seen_at: i.seenAt,
    p_price_minor: i.priceMinor,
    p_shipping_minor: i.shippingMinor,
    ...(i.url ? { p_url: i.url } : {}),
    ...(i.store ? { p_store: i.store } : {}),
    ...(i.city ? { p_city: i.city } : {}),
    ...(i.seenOn ? { p_seen_on: i.seenOn } : {}),
  });
  if (res.error?.message === 'invalid_input' && res.error.details === 'price') {
    throw new DataError('invalid_input', 'price', 'That isn’t lower than our price.');
  }
  const json = unwrap(res) as Row;
  return { report: toReport(json), updated: json.updated === true };
}

/** The caller's open report on a product, if they have one. */
export async function myOpenPriceReport(db: Db, productId: string, userId: string): Promise<PriceReport | null> {
  const row = unwrap(
    await db.from('price_reports').select(REPORT_COLS).eq('product_id', productId).eq('user_id', userId).eq('status', 'open').maybeSingle(),
  ) as Row | null;
  return row ? toReport(row) : null;
}

// ---------------------------------------------------------------------------
// admins
// ---------------------------------------------------------------------------

export type PriceReportView = 'open' | 'reviewed';
export const PRICE_REPORT_VIEWS: readonly PriceReportView[] = ['open', 'reviewed'];
/** The most reports a view reads, newest first. */
export const PRICE_REPORT_LIMIT = 300;

export function priceReportView(v: unknown): PriceReportView {
  return v === 'reviewed' ? 'reviewed' : 'open';
}

/** A product's reports in a view, with the lowest against what it costs now. */
export interface PricedProduct {
  productId: string;
  title: string;
  archived: boolean;
  /** its price now */
  priceMinor: number;
  /** the lowest report, delivery included */
  lowestMinor: number;
  reports: PriceReport[];
}

export interface PriceReportQueue {
  products: PricedProduct[];
  /** reports in each view */
  counts: Record<PriceReportView, number>;
}

/**
 * A store's lower-price reports, by product: open ones (most reported first, then the biggest gap
 * under the price now) or reviewed ones (latest first). Each product's reports are lowest first.
 */
export async function listPriceReportQueue(db: Db, market: Market, opts: { view?: PriceReportView } = {}): Promise<PriceReportQueue> {
  const view = opts.view ?? 'open';
  const count = (v: PriceReportView) =>
    db.from('price_reports').select('id, products!inner(market_id)', { count: 'exact', head: true }).eq('products.market_id', market).eq('status', v);
  const [res, open, reviewed] = await Promise.all([
    db
      .from('price_reports')
      .select(`${REPORT_COLS}, products!inner(market_id, title, price_minor, archived_at)`)
      .eq('products.market_id', market)
      .eq('status', view)
      .order(view === 'open' ? 'created_at' : 'reviewed_at', { ascending: false })
      .order('id')
      .limit(PRICE_REPORT_LIMIT),
    count('open'),
    count('reviewed'),
  ]);
  const rows = (unwrap(res) ?? []) as unknown as Row[];
  const byProduct = new Map<string, PricedProduct>();
  for (const r of rows) {
    const report = toReport(r);
    const p = (r.products as Row | null) ?? {};
    const entry = byProduct.get(report.productId) ?? {
      productId: report.productId,
      title: String(p.title ?? ''),
      archived: p.archived_at != null,
      priceMinor: Number(p.price_minor ?? 0),
      lowestMinor: reportTotal(report),
      reports: [],
    };
    entry.reports.push(report);
    entry.lowestMinor = Math.min(entry.lowestMinor, reportTotal(report));
    byProduct.set(report.productId, entry);
  }
  const products = [...byProduct.values()];
  for (const p of products) p.reports.sort((a, b) => reportTotal(a) - reportTotal(b) || b.updatedAt.localeCompare(a.updatedAt));
  if (view === 'open') {
    products.sort((a, b) => b.reports.length - a.reports.length || (a.lowestMinor - a.priceMinor) - (b.lowestMinor - b.priceMinor) || a.title.localeCompare(b.title));
  }
  return { products, counts: { open: open.count ?? 0, reviewed: reviewed.count ?? 0 } };
}

/** An admin marks every open report on one of the store's products reviewed; how many there were. */
export async function reviewPriceReports(db: Db, market: Market, productId: string): Promise<number> {
  const product = unwrap(await db.from('products').select('id').eq('id', productId).eq('market_id', market).maybeSingle());
  if (!product) throw new DataError('product_not_found');
  return Number(unwrap(await db.rpc('review_price_reports', { p_product: productId })));
}
