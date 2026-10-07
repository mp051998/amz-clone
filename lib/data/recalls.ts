import type { Db } from '../db/client';
import type { Market } from '../types';
import { DataError, unwrap } from './errors';

/**
 * Recalls and product safety alerts (20261213090000_product_recalls.sql). An admin recalls a
 * product through recall_product, which takes it off sale for good. Recalls are public: the
 * product page and /recalls show them, and shoppers who bought a recalled product see it on
 * /recalls, in their messages and on the order.
 */

export const RECALL_TEXT_MIN = 10;
export const RECALL_TEXT_MAX = 500;
/** The most recalls a store's /recalls page lists. */
export const RECALLS_LIMIT = 50;

export interface Recall {
  productId: string;
  title: string;
  image: string;
  /** what's wrong with it */
  hazard: string;
  /** what the shopper should do */
  remedy: string;
  issuedAt: string;
  updatedAt: string;
}

/** A recall of something the shopper bought, with the latest order it was on. */
export interface MyRecall extends Recall {
  orderId: string;
  orderedAt: string;
}

type Row = {
  product_id: string;
  hazard: string;
  remedy: string;
  issued_at: string;
  updated_at: string;
  products: { title: string; image: string; market_id: string };
};

const COLS = 'product_id, hazard, remedy, issued_at, updated_at, products!inner(title, image, market_id)';

function toRecall(r: Row): Recall {
  return {
    productId: r.product_id,
    title: r.products.title,
    image: r.products.image,
    hazard: r.hazard,
    remedy: r.remedy,
    issuedAt: r.issued_at,
    updatedAt: r.updated_at,
  };
}

/** The field that's wrong with a recall's text, and why; null when both are fine. */
export function recallInputError(hazard: unknown, remedy: unknown): { field: 'hazard' | 'remedy'; message: string } | null {
  const ok = (v: unknown) => typeof v === 'string' && v.trim().length >= RECALL_TEXT_MIN && v.trim().length <= RECALL_TEXT_MAX;
  if (!ok(hazard)) return { field: 'hazard', message: `Say what the hazard is, in ${RECALL_TEXT_MIN} to ${RECALL_TEXT_MAX} characters.` };
  if (!ok(remedy)) return { field: 'remedy', message: `Say what shoppers should do, in ${RECALL_TEXT_MIN} to ${RECALL_TEXT_MAX} characters.` };
  return null;
}

/** A store's recalls, newest first. */
export async function listRecalls(db: Db, market: Market, limit = RECALLS_LIMIT): Promise<Recall[]> {
  const rows = unwrap(
    await db.from('product_recalls').select(COLS).eq('products.market_id', market).order('issued_at', { ascending: false }).limit(limit),
  ) as unknown as Row[];
  return rows.map(toRecall);
}

/** A product's recall, if it has been recalled. */
export async function getRecall(db: Db, productId: string): Promise<Recall | null> {
  const row = unwrap(await db.from('product_recalls').select(COLS).eq('product_id', productId).maybeSingle()) as unknown as Row | null;
  return row ? toRecall(row) : null;
}

/** The recalled products among these (an order's items), by product id. */
export async function recallsFor(db: Db, productIds: string[]): Promise<Map<string, Recall>> {
  if (!productIds.length) return new Map();
  const rows = unwrap(await db.from('product_recalls').select(COLS).in('product_id', productIds)) as unknown as Row[];
  return new Map(rows.map((r) => [r.product_id, toRecall(r)]));
}

type BoughtRow = { product_id: string; order_id: string; orders: { created_at: string } };

/** Recalls of products the shopper bought in this store (on orders that went through), newest recall first. */
export async function myRecalls(db: Db, market: Market, userId: string): Promise<MyRecall[]> {
  const recalls = await listRecalls(db, market, 200);
  if (!recalls.length) return [];
  const bought = unwrap(
    await db
      .from('order_items')
      .select('product_id, order_id, orders!inner(created_at, status, market_id, user_id)')
      .in('product_id', recalls.map((r) => r.productId))
      .eq('orders.user_id', userId)
      .eq('orders.market_id', market)
      .eq('orders.status', 'placed'),
  ) as unknown as BoughtRow[];
  const latest = new Map<string, BoughtRow>();
  for (const b of bought) {
    const seen = latest.get(b.product_id);
    if (!seen || Date.parse(b.orders.created_at) > Date.parse(seen.orders.created_at)) latest.set(b.product_id, b);
  }
  return recalls.flatMap((r) => {
    const b = latest.get(r.productId);
    return b ? [{ ...r, orderId: b.order_id, orderedAt: b.orders.created_at }] : [];
  });
}

/**
 * Recall a product (admins): takes it off sale for good. Recalling it again rewrites the hazard and
 * remedy (`updated`) and keeps the date it was first issued.
 */
export async function recallProduct(db: Db, productId: string, input: { hazard: unknown; remedy: unknown }): Promise<{ recall: Recall; updated: boolean }> {
  const bad = recallInputError(input.hazard, input.remedy);
  if (bad) throw new DataError('invalid_input', bad.field, bad.message);
  const json = unwrap(
    await db.rpc('recall_product', { p_product: productId, p_hazard: String(input.hazard).trim(), p_remedy: String(input.remedy).trim() }),
  ) as Record<string, unknown>;
  const recall = await getRecall(db, productId);
  if (!recall) throw new DataError('product_not_found');
  return { recall, updated: json.updated === true };
}
