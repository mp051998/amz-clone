import type { Db } from '../db/client';
import type { Product } from '../types';
import { foldVariants } from '../variants';
import { getProducts } from './catalog';

/**
 * "Customers who bought this item also bought" (20261218090000_also_bought.sql): up to `n` of this
 * store's products on sale that the shoppers who bought this one bought too, in any of their
 * orders, most of those shoppers first, one option per variant group. A product only counts once
 * two different shoppers have bought both. Empty when there's nothing yet, and on an error (the
 * page goes on without it).
 */
export async function alsoBought(db: Db, product: Product, n = 8): Promise<Product[]> {
  const res = await db.rpc('also_bought', { p_product_id: product.id, p_limit: n + 4 });
  if (res.error) return [];
  const ids = ((res.data ?? []) as { id: string }[]).map((x) => x.id);
  const items = (await getProducts(db, ids)).filter((p) => p.market === product.market && !p.archived && p.id !== product.id);
  return foldVariants(items).slice(0, n);
}
