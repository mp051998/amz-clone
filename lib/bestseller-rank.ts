import type { Db } from '@/lib/db/client';
import { listProducts } from '@/lib/data/catalog';
import type { Market, Product } from '@/lib/types';

/** How deep the PDP looks for "Best Sellers Rank" (past it, no rank is shown). */
export const RANK_DEPTH = 100;

/**
 * "#3 in Headphones": the product's place in its department on the bestsellers list (same
 * 'popular' ordering, one card per variant group, so a colour option shares its group's rank).
 * Null outside the top `depth` or for products no longer listed.
 */
export async function bestsellerRank(client: Db, p: Pick<Product, 'id' | 'market' | 'category' | 'variant'>, depth = RANK_DEPTH): Promise<number | null> {
  const list = await listProducts(client, p.market, { category: p.category, order: 'popular', limit: depth });
  const i = list.findIndex((x) => sameCard(x, p));
  return i < 0 ? null : i + 1;
}

type Listed = Pick<Product, 'id' | 'variant'>;

/** The same bestsellers card: the product, or another option of its variant group. */
const sameCard = (x: Listed, p: Listed) => x.id === p.id || (p.variant != null && x.variant?.group === p.variant.group);

/** Each department's #1 on the bestsellers list, by department slug (search results' "#1 Best Seller"). */
export async function topSellers(client: Db, market: Market, categories: readonly string[]): Promise<Map<string, Listed>> {
  const out = new Map<string, Listed>();
  await Promise.all(
    [...new Set(categories)].map(async (category) => {
      const [top] = await listProducts(client, market, { category, order: 'popular', limit: 1 });
      if (top) out.set(category, top);
    }),
  );
  return out;
}

/** Whether a product is its department's #1 best seller (`tops` from topSellers). */
export function isTopSeller(p: Pick<Product, 'id' | 'category' | 'variant'>, tops: ReadonlyMap<string, Listed>): boolean {
  const top = tops.get(p.category);
  return top != null && sameCard(top, p);
}
