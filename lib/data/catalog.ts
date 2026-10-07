import type { Db } from '../db/client';
import { toDetailRows, type DetailRow } from '../product-details';
import type { Category, Market, Product, RatingSummary } from '../types';
import { NO_SUGGESTIONS, PAGE_SIZE, SUGGEST_MIN, type SearchQuery, type SearchResult, type Suggestions } from '../search';
import { unwrap } from './errors';
import { toProduct } from './map';
import { foldVariants, type VariantSummary } from '../variants';

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

/** Pages, carts and saved lists still show an archived product; listings never do. */
export interface ProductReadOptions {
  includeArchived?: boolean;
}

/**
 * Rows by id from catalog_products_all (archived included) or catalog_products (active only).
 * Falls back to catalog_products if the _all view isn't there yet: Vercel can deploy this code a
 * minute before the migration that adds it, and until then nothing is archived anyway.
 */
async function productRows(db: Db, ids: readonly string[], opts: ProductReadOptions) {
  if (opts.includeArchived) {
    const res = await db.from('catalog_products_all').select('*').in('id', [...ids]);
    if (!res.error) return res.data;
  }
  return unwrap(await db.from('catalog_products').select('*').in('id', [...ids]));
}

export async function getProduct(db: Db, id: string, opts: ProductReadOptions = {}): Promise<Product | null> {
  const [row] = await productRows(db, [id], opts);
  return row ? toProduct(row) : null;
}

/** One option of a product's variant group: a sibling product (or the product itself). */
export interface ProductVariant {
  id: string;
  label: string;
  image: string;
  priceMinor: number;
  stock: number;
  /** the product this info is for */
  current: boolean;
}

/** The long-form copy and extras a product page shows beyond the catalog row. */
export interface ProductInfo {
  description: string | null;
  details: DetailRow[];
  /** more images after the main one */
  gallery: string[];
  /** options when the product is one of a variant group (e.g. Color: Black | Blue), else null */
  variants: { group: string; axis: string; label: string; options: ProductVariant[] } | null;
}

const NO_INFO: ProductInfo = { description: null, details: [], gallery: [], variants: null };
const MISSING_COLUMN = '42703';

/** Natural order for option labels: "1.5 Litre" before "3 Litre", "8 GB" before "16 GB". */
const byLabel = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * A product's description, "Product information" rows, gallery and variant options. Empty when
 * the columns aren't there yet (Vercel can deploy this a minute before the migration that adds
 * them) or the id is unknown. Options leave out archived siblings, but keep the product itself.
 */
export async function getProductInfo(db: Db, id: string): Promise<ProductInfo> {
  const res = await db.from('products').select('market_id, description, details, gallery, variant_group, variant_axis, variant_label').eq('id', id).maybeSingle();
  if (res.error?.code === MISSING_COLUMN) {
    const old = await db.from('products').select('description, details').eq('id', id).maybeSingle();
    if (old.error?.code === MISSING_COLUMN) return NO_INFO;
    const row = unwrap(old);
    return row ? { ...NO_INFO, description: row.description, details: toDetailRows(row.details) } : NO_INFO;
  }
  const row = unwrap(res);
  if (!row) return NO_INFO;
  const info: ProductInfo = { description: row.description, details: toDetailRows(row.details), gallery: row.gallery ?? [], variants: null };
  if (row.variant_group && row.variant_axis && row.variant_label) {
    const sibs = unwrap(
      await db
        .from('products')
        .select('id, variant_label, image, price_minor, stock, archived_at')
        .eq('market_id', row.market_id)
        .eq('variant_group', row.variant_group),
    );
    const options = sibs
      .filter((s) => s.variant_label && (s.id === id || !s.archived_at))
      .map((s) => ({ id: s.id, label: s.variant_label!, image: s.image, priceMinor: s.price_minor, stock: s.stock, current: s.id === id }))
      .sort((a, b) => byLabel.compare(a.label, b.label));
    // a group of one is just a product
    if (options.length > 1) info.variants = { group: row.variant_group, axis: row.variant_axis, label: row.variant_label, options };
  }
  return info;
}

/** Products by id, in the order the ids were given (unknown ids are skipped). */
export async function getProducts(db: Db, ids: readonly string[], opts: ProductReadOptions = {}): Promise<Product[]> {
  if (!ids.length) return [];
  const rows = await productRows(db, ids, opts);
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
  /** only this seller's products */
  seller?: string;
  dealsOnly?: boolean;
  order?: ListOrder;
  limit?: number;
  excludeId?: string;
  /** every option of a variant group (default: its first, see `foldVariants`). */
  allVariants?: boolean;
}

export async function listProducts(db: Db, market: Market, opts: ListOptions = {}): Promise<Product[]> {
  let q = db.from('catalog_products').select('*').eq('market_id', market);
  if (opts.category) q = q.eq('category_slug', opts.category);
  if (opts.seller) q = q.eq('seller', opts.seller);
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
  // folding drops a group's other options, so read spare rows to still fill the limit
  const fold = !opts.allVariants;
  if (opts.limit) q = q.limit(fold ? opts.limit * 2 : opts.limit);
  const products = unwrap(await q).map(toProduct);
  if (!fold) return products;
  const folded = foldVariants(products);
  return opts.limit ? folded.slice(0, opts.limit) : folded;
}

/**
 * "Most Wished For": what shoppers added to their lists most in the last 30 days (each shopper
 * counted once), then the bestsellers to fill the page. Whose lists stay private; the database
 * hands out only the ranking.
 */
export function mostWishedFor(db: Db, market: Market, opts: ChartOptions = {}): Promise<Product[]> {
  return rankedChart(db, 'most_wished_for', market, opts);
}

/**
 * "Gift Ideas": the products shoppers give most lately (ranked in the database from gift orders and
 * items bought off shared lists), then the bestsellers.
 */
export function giftIdeas(db: Db, market: Market, opts: ChartOptions = {}): Promise<Product[]> {
  return rankedChart(db, 'gift_ideas', market, opts);
}

type ChartOptions = { category?: string; limit?: number };

/** The store's charts, by the path each lives at (`/bestsellers`, …). */
export const CHART_KINDS = ['bestsellers', 'new-releases', 'most-wished-for', 'gift-ideas'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

export function isChartKind(v: string): v is ChartKind {
  return (CHART_KINDS as readonly string[]).includes(v);
}

/** One of the store's charts, top `limit` (40) first, in a department or across the store. */
export function chart(db: Db, market: Market, kind: ChartKind, opts: ChartOptions = {}): Promise<Product[]> {
  const limit = opts.limit ?? 40;
  switch (kind) {
    case 'bestsellers':
      return listProducts(db, market, { category: opts.category, order: 'popular', limit });
    case 'new-releases':
      return listProducts(db, market, { category: opts.category, order: 'fresh', limit });
    case 'most-wished-for':
      return mostWishedFor(db, market, { ...opts, limit });
    case 'gift-ideas':
      return giftIdeas(db, market, { ...opts, limit });
  }
}

/** A chart ranked by `rpc` (product ids, best first), filled up with the bestsellers it doesn't repeat. */
async function rankedChart(db: Db, rpc: 'most_wished_for' | 'gift_ideas', market: Market, opts: ChartOptions): Promise<Product[]> {
  const limit = opts.limit ?? 40;
  const res = await db.rpc(rpc, { p_market: market, p_limit: limit, ...(opts.category ? { p_category: opts.category } : {}) });
  // PGRST202: the ranking isn't deployed yet; the bestsellers stand in
  const ranked = foldVariants(res.error?.code === 'PGRST202' ? [] : await getProducts(db, unwrap(res) ?? []));
  if (ranked.length >= limit) return ranked.slice(0, limit);
  // a variant group shows once, at its best-placed option
  const rest = await listProducts(db, market, { category: opts.category, order: 'popular', limit: limit * 2 });
  return foldVariants([...ranked, ...rest]).slice(0, limit);
}

/** Variant groups of a store as listing cards show them, options in label order. */
export async function variantSummaries(db: Db, market: Market, groups: readonly string[]): Promise<Map<string, VariantSummary>> {
  const out = new Map<string, VariantSummary>();
  if (!groups.length) return out;
  const res = await db
    .from('catalog_products')
    .select('id, image, stock, variant_group, variant_axis, variant_label')
    .eq('market_id', market)
    .in('variant_group', [...new Set(groups)]);
  if (res.error) return out; // swatches only (or the columns aren't deployed yet)
  for (const r of res.data) {
    if (!r.variant_group || !r.variant_label) continue;
    const g = out.get(r.variant_group) ?? { axis: r.variant_axis ?? 'Style', options: [] };
    g.options.push({ id: r.id!, label: r.variant_label, image: r.image ?? '', stock: r.stock ?? 0 });
    out.set(r.variant_group, g);
  }
  for (const g of out.values()) g.options.sort((a, b) => byLabel.compare(a.label, b.label));
  return out;
}

/** Search-as-you-type: completions of the last word, top departments and a few products. */
export async function suggestSearch(db: Db, market: Market, q: string): Promise<Suggestions> {
  if (q.replace(/[^\p{L}\p{N}]/gu, '').length < SUGGEST_MIN) return NO_SUGGESTIONS;
  const res = await db.rpc('search_suggest', { p_market: market, p_q: q.slice(0, 200) });
  if (res.error?.code === 'PGRST202') return NO_SUGGESTIONS; // not migrated yet
  return unwrap(res) as unknown as Suggestions;
}

interface SearchJson {
  total: number;
  /** matches counted once per variant group (absent before the fold-variants migration) */
  groups?: number;
  /** matches with no option in stock (absent before the search-in-stock migration) */
  unavailable?: number;
  page: number;
  page_count: number;
  brands: { name: string; count: number }[];
  /** absent before the search-sellers migration */
  sellers?: { name: string; count: number }[];
  items: Parameters<typeof toProduct>[0][];
}

/** Full search page in one RPC: filtered + sorted page, total, and brand facets. Products with none left are left out unless `query.includeOutOfStock`. */
export async function searchCatalog(db: Db, market: Market, query: SearchQuery): Promise<SearchResult> {
  const json = unwrap(
    await db.rpc('search_catalog', {
      p_market: market,
      p_q: query.k ?? undefined,
      p_dept: query.dept ?? undefined,
      p_brands: query.brand?.length ? query.brand : undefined,
      p_sellers: query.seller?.length ? query.seller : undefined,
      p_min_rating: query.rating ?? undefined,
      p_deal: query.deal ?? false,
      p_sort: query.sort,
      p_page: query.page,
      p_page_size: PAGE_SIZE,
      p_min_price: query.minPrice ?? undefined,
      p_max_price: query.maxPrice ?? undefined,
      p_in_stock: !query.includeOutOfStock,
      p_min_discount: query.minDiscount ?? undefined,
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
    groups: json.groups ?? json.total,
    pageCount: json.page_count,
    brandFacets: json.brands,
    sellerFacets: json.sellers ?? [],
    unavailable: json.unavailable ?? 0,
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
