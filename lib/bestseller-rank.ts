import type { Db } from '@/lib/db/client';
import { listProducts } from '@/lib/data/catalog';
import type { Product } from '@/lib/types';

/** How deep the PDP looks for "Best Sellers Rank" (past it, no rank is shown). */
export const RANK_DEPTH = 100;

/**
 * "#3 in Headphones": the product's place in its department on the bestsellers list (same
 * 'popular' ordering, one card per variant group, so a colour option shares its group's rank).
 * Null outside the top `depth` or for products no longer listed.
 */
export async function bestsellerRank(client: Db, p: Pick<Product, 'id' | 'market' | 'category' | 'variant'>, depth = RANK_DEPTH): Promise<number | null> {
  const list = await listProducts(client, p.market, { category: p.category, order: 'popular', limit: depth });
  const i = list.findIndex((x) => x.id === p.id || (p.variant != null && x.variant?.group === p.variant.group));
  return i < 0 ? null : i + 1;
}
