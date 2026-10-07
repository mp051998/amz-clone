import type { Db } from '../db/client';
import type { Product } from '../types';
import { foldVariants } from '../variants';
import { getProducts } from './catalog';
import { DataError, unwrap } from './errors';

/** How many of the products looked at just before a view it's counted with. */
export const VIEW_PAIRS = 5;

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Count a product page view with the products this device looked at just before it, newest
 * first (its browsing history). Only the first VIEW_PAIRS other products of the same store
 * count; with none, nothing is recorded.
 */
export async function recordView(db: Db, productId: string, recent: unknown): Promise<void> {
  if (recent !== undefined && (!Array.isArray(recent) || recent.length > 30 || !recent.every((id) => typeof id === 'string' && ID.test(id)))) {
    throw new DataError('invalid_input', 'recent', 'recent must be a list of product ids.');
  }
  const ids = [...new Set((recent ?? []) as string[])].filter((id) => id !== productId).slice(0, VIEW_PAIRS);
  if (!ids.length) return;
  unwrap(await db.rpc('record_product_view', { p_product_id: productId, p_recent: ids }));
}

/**
 * "Customers who viewed this item also viewed": up to `n` of this store's products on sale, most
 * views with this one first, one option per variant group. Empty when nothing's been viewed with
 * it, and on an error (the page goes on without it).
 */
export async function alsoViewed(db: Db, product: Product, n = 8): Promise<Product[]> {
  const res = await db.rpc('also_viewed', { p_product_id: product.id, p_limit: n + 4 });
  if (res.error) return [];
  const ids = ((res.data ?? []) as { id: string }[]).map((x) => x.id);
  const items = (await getProducts(db, ids)).filter((p) => p.market === product.market && !p.archived && p.id !== product.id);
  return foldVariants(items).slice(0, n);
}
