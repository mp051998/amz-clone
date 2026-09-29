import type { Db } from '../db/client';
import type { Category, Market, Product, RatingSummary } from '../types';
import { PAGE_SIZE, type SearchQuery, type SearchResult } from '../search';
import { unwrap } from './errors';
import { toProduct } from './map';

/** Departments a market shows, in its nav order. */
export async function listCategories(db: Db, market: Market): Promise<Category[]> {
  const rows = unwrap(
    await db
      .from('market_categories')
      .select('position, categories(slug, name)')
      .eq('market_id', market)
      .order('position'),
  );
  return rows.flatMap((r) => (r.categories ? [{ slug: r.categories.slug, name: r.categories.name }] : []));
}

export async function getProduct(db: Db, id: string): Promise<Product | null> {
  const row = unwrap(await db.from('catalog_products').select('*').eq('id', id).maybeSingle());
  return row ? toProduct(row) : null;
}

/** Products by id, in the order the ids were given (unknown ids are skipped). */
export async function getProducts(db: Db, ids: readonly string[]): Promise<Product[]> {
  if (!ids.length) return [];
  const rows = unwrap(await db.from('catalog_products').select('*').in('id', [...ids]));
  const byId = new Map(rows.map((r) => [r.id, toProduct(r)]));
  return ids.flatMap((id) => {
    const p = byId.get(id);
    return p ? [p] : [];
  });
}

export type ListOrder =
  /** catalog order */
  | 'position'
  /** review volume, then rating — the best-sellers proxy */
  | 'popular'
  /** highly rated but still building volume — the new-releases proxy */
  | 'fresh';

export interface ListOptions {
  category?: string;
  dealsOnly?: boolean;
  order?: ListOrder;
  limit?: number;
  excludeId?: string;
}

export async function listProducts(db: Db, market: Market, opts: ListOptions = {}): Promise<Product[]> {
  let q = db.from('catalog_products').select('*').eq('market_id', market);
  if (opts.category) q = q.eq('category_slug', opts.category);
  if (opts.dealsOnly) q = q.eq('deal', true).not('deal_pct', 'is', null);
  if (opts.excludeId) q = q.neq('id', opts.excludeId);
  switch (opts.order ?? 'position') {
    case 'popular':
      q = q.order('review_count', { ascending: false }).order('rating', { ascending: false });
      break;
    case 'fresh':
      q = q.order('rating', { ascending: false }).order('review_count', { ascending: true });
      break;
  }
  q = q.order('position');
  if (opts.limit) q = q.limit(opts.limit);
  return unwrap(await q).map(toProduct);
}

interface SearchJson {
  total: number;
  page: number;
  page_count: number;
  brands: { name: string; count: number }[];
  items: Parameters<typeof toProduct>[0][];
}

/** Full search page in one RPC: filtered + sorted page, total, and brand facets. */
export async function searchCatalog(db: Db, market: Market, query: SearchQuery): Promise<SearchResult> {
  const json = unwrap(
    await db.rpc('search_catalog', {
      p_market: market,
      p_q: query.k ?? undefined,
      p_dept: query.dept ?? undefined,
      p_brands: query.brand?.length ? query.brand : undefined,
      p_min_rating: query.rating ?? undefined,
      p_deal: query.deal ?? false,
      p_sort: query.sort,
      p_page: query.page,
      p_page_size: PAGE_SIZE,
    }),
  ) as unknown as SearchJson;

  let headingLabel = 'All departments';
  if (query.k) headingLabel = `"${query.k}"`;
  else if (query.dept) {
    const cats = await listCategories(db, market);
    headingLabel = cats.find((c) => c.slug === query.dept)?.name ?? query.dept;
  }

  return {
    query: { ...query, page: json.page },
    items: json.items.map(toProduct),
    total: json.total,
    pageCount: json.page_count,
    brandFacets: json.brands,
    headingLabel,
  };
}

/** Average, volume and per-star histogram (5 → 1) for a product. */
export async function getRatingSummary(db: Db, productId: string): Promise<RatingSummary> {
  const row = unwrap(await db.from('product_ratings').select('*').eq('product_id', productId).maybeSingle());
  const count = row?.rating_count ?? 0;
  const stars = row ? [row.star_5, row.star_4, row.star_3, row.star_2, row.star_1] : [0, 0, 0, 0, 0];
  return {
    rating: count ? Math.round((Number(row!.rating_sum) / count) * 10) / 10 : 0,
    count,
    bars: stars.map((n, i) => ({ star: 5 - i, count: n, pct: count ? Math.round((n / count) * 100) : 0 })),
  };
}
