import 'server-only';
import type { Db } from '../db/client';
import { getProducts, listProducts, searchCatalog } from '../data/catalog';
import { getInsight as readInsight, getInsights } from '../data/insights';
import { formatMoney } from '../marketplaces';
import { PAGE_SIZE, type SearchQuery } from '../search';
import { db as requestDb } from '../supabase/server';
import type { Market, Product } from '../types';
import { decisionConfig, weightsFor } from './attributes';
import { pricePercentiles } from './derive';
import { kindMatch, productKind, sameKind } from './kind';
import { rankProducts, scoresFor, type RankSort } from './rank';
import type { ParsedQuery, ProductInsight, RankedProduct, Weights } from './types';
import { foldVariants } from '../variants';
import { shortTitle } from './verdict';

/**
 * Server-side decision helpers: candidate retrieval + ranking for search,
 * insights, alternatives and cart accessories. Every function takes an
 * optional Supabase client (defaults to the request's cookie-bound client;
 * REST routes pass their bearer client).
 */

/** Candidates pulled per ranked search (3 search pages). */
export const CANDIDATE_LIMIT = 48;

export interface RankFilters {
  brand?: string[];
  /** sold by any of these */
  seller?: string[];
  /** comes in any of these sizes */
  size?: string[];
  /** minimum star rating 1..5 */
  rating?: number;
  deal?: boolean;
  /** Climate Pledge Friendly products only */
  climate?: boolean;
  /** Small Business products only */
  smallBusiness?: boolean;
  /** lowest price, minor units (the budget is the highest) */
  minPrice?: number;
  /** keep products with none left ("Include Out of Stock"); left out otherwise */
  includeOutOfStock?: boolean;
  /** only products on sale for at least this percentage off */
  minDiscount?: number;
  sort?: RankSort;
}

export interface RankedSearchResult {
  /** candidates within budget, ranked (all of them — paginate in the UI) */
  items: RankedProduct[];
  /** items.length */
  total: number;
  /** candidates considered, each variant group once */
  candidates: number;
  /** nothing in the price range, though the words and filters match products at other prices */
  pricedOut: boolean;
  /** matches left out because no option is in stock, each variant group once */
  unavailable: number;
}

async function client(c?: Db): Promise<Db> {
  return c ?? (await requestDb());
}

type CandidateQuery = Omit<SearchQuery, 'page'>;

/** The catalog order to pull candidates in, so a sort sees the whole catalog's cheapest, best rated, newest or best selling, not those of the featured few. */
const CANDIDATE_SORT: Record<RankSort, SearchQuery['sort']> = {
  match: 'featured',
  'price-asc': 'price-asc',
  'price-desc': 'price-desc',
  rating: 'review',
  newest: 'newest',
  bestsellers: 'bestsellers',
};

/** The catalog search behind a ranked search, at any price. */
function candidateQuery(q: ParsedQuery, f: RankFilters): CandidateQuery {
  return {
    k: q.keywords || undefined,
    dept: q.category ?? undefined,
    brand: f.brand?.length ? f.brand : undefined,
    seller: f.seller?.length ? f.seller : undefined,
    size: f.size?.length ? f.size : undefined,
    rating: f.rating,
    deal: f.deal || undefined,
    climate: f.climate || undefined,
    smallBusiness: f.smallBusiness || undefined,
    includeOutOfStock: f.includeOutOfStock || undefined,
    minDiscount: f.minDiscount,
    sort: CANDIDATE_SORT[f.sort ?? 'match'],
  };
}

async function searchCandidates(c: Db, market: Market, base: CandidateQuery): Promise<{ products: Product[]; unavailable: number }> {
  const pages = Math.ceil(CANDIDATE_LIMIT / PAGE_SIZE);
  const first = await searchCatalog(c, market, { ...base, page: 1 });
  const rest = await Promise.all(
    Array.from({ length: Math.min(pages, first.pageCount) - 1 }, (_, i) => searchCatalog(c, market, { ...base, page: i + 2 })),
  );
  const seen = new Set<string>();
  const products = [first, ...rest]
    .flatMap((r) => r.items)
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .slice(0, CANDIDATE_LIMIT);
  return { products, unavailable: first.unavailable };
}

/**
 * Ranked search. Pulls up to 48 candidates via `searchCatalog` (keywords,
 * category, facet filters and the price range: `filters.minPrice` up to
 * `budgetMinor`; in stock unless `filters.includeOutOfStock`), in the catalog
 * order of the sort (featured for 'match', cheapest first for 'price-asc', …); when keywords match nothing inside a detected category, at any
 * price, falls back to that category's popular products. Candidates are then
 * ranked against `weights` (`filters.sort`, default 'match').
 */
export async function rankedSearch(
  market: Market,
  parsedQuery: ParsedQuery,
  weights: Weights | null,
  budgetMinor: number | null,
  filters: RankFilters = {},
  c?: Db,
): Promise<RankedSearchResult> {
  const db = await client(c);
  const base = candidateQuery(parsedQuery, filters);
  const priced = Boolean(filters.minPrice || budgetMinor);
  const found = await searchCandidates(db, market, { ...base, minPrice: filters.minPrice, maxPrice: budgetMinor ?? undefined });
  let products = found.products;
  const pricedOut = !products.length && priced && (await searchCatalog(db, market, { ...base, page: 1 })).total > 0;
  // the words matched, only nothing is in stock: say so (the page offers to include them), no fallback
  if (!products.length && !pricedOut && !found.unavailable && parsedQuery.category && parsedQuery.keywords) {
    products = await listProducts(db, market, { category: parsedQuery.category, order: 'popular', limit: CANDIDATE_LIMIT });
    if (!filters.includeOutOfStock) products = products.filter((p) => p.stock > 0);
    if (filters.rating) products = products.filter((p) => p.rating >= filters.rating!);
    if (filters.brand?.length) products = products.filter((p) => p.brand && filters.brand!.includes(p.brand));
    if (filters.seller?.length) products = products.filter((p) => filters.seller!.includes(p.seller));
    if (filters.size?.length) products = products.filter((p) => p.sizes?.some((s) => filters.size!.includes(s)));
    if (filters.deal) products = products.filter((p) => p.deal && p.dealPct);
    if (filters.climate) products = products.filter((p) => p.climate?.length);
    if (filters.smallBusiness) products = products.filter((p) => p.smallBusiness);
    if (filters.minDiscount) products = products.filter((p) => p.deal && (p.dealPct ?? 0) >= filters.minDiscount!);
    if (filters.minPrice) products = products.filter((p) => p.priceMinor >= filters.minPrice!);
  }
  const insights = await getInsights(db, products.map((p) => p.id));
  const w = weights ?? weightsFor(parsedQuery.category, parsedQuery.use);
  // one card per variant group: its best-ranked option (within budget, and in stock, if any)
  const items = foldVariants(rankProducts(products, insights, w, { budgetMinor, sort: filters.sort ?? 'match' }), (r) => r.product);
  return { items, total: items.length, candidates: foldVariants(products).length, pricedOut, unavailable: found.unavailable };
}

/** A product's stored insight (public), or null. */
export async function getInsight(productId: string, c?: Db): Promise<ProductInsight | null> {
  return readInsight(await client(c), productId);
}

export interface Alternative extends RankedProduct {
  /** signed price difference vs the base product, minor units (negative = cheaper) */
  priceDeltaMinor: number;
  /** one line, e.g. "₹800 cheaper · better battery life" */
  diff: string;
}

function diffLine(base: Product, alt: Product, baseScores: Record<string, number>, altScores: Record<string, number>): string {
  const cfg = decisionConfig(base.category);
  const delta = alt.priceMinor - base.priceMinor;
  const better = cfg.attributes
    .filter((a) => a.key !== 'value')
    .map((a) => ({ a, d: (altScores[a.key] ?? 3) - (baseScores[a.key] ?? 3) }))
    .sort((x, y) => y.d - x.d)[0];
  const worse = cfg.attributes
    .filter((a) => a.key !== 'value')
    .map((a) => ({ a, d: (altScores[a.key] ?? 3) - (baseScores[a.key] ?? 3) }))
    .sort((x, y) => x.d - y.d)[0];
  const money = formatMoney(Math.abs(delta), base.curBase);
  const price = Math.abs(delta) < 100 ? 'Same price' : delta < 0 ? `${money} cheaper` : `${money} more`;
  if (better && better.d > 0) return `${price} · better ${better.a.phrase}`;
  if (delta < 0 && worse && worse.d < 0) return `${price} · trades some ${worse.a.phrase}`;
  if (alt.rating > base.rating) return `${price} · rated ${alt.rating.toFixed(1)}★`;
  return `${price} · similar overall`;
}

/**
 * Up to `n` alternatives to `product`: same category and market, priced within
 * ±50% (nearest price first, then rating), each with a one-line difference.
 * `weights` (default: the category defaults) sets their match %.
 */
export async function alternativesFor(product: Product, n = 3, weights?: Weights, c?: Db): Promise<Alternative[]> {
  const db = await client(c);
  const pool = await listProducts(db, product.market, { category: product.category, excludeId: product.id, order: 'popular', limit: CANDIDATE_LIMIT });
  // category is broad (headphones vs smartwatches) — keep to the same sort of product
  const near = sameKind(product.title, pool)
    // another option of the same product isn't an alternative (the page offers those as variants)
    .filter((p) => !product.variant || p.variant?.group !== product.variant.group)
    .filter((p) => p.priceMinor >= product.priceMinor * 0.5 && p.priceMinor <= product.priceMinor * 1.5 && p.stock > 0)
    .sort(
      (a, b) =>
        Math.abs(a.priceMinor - product.priceMinor) - Math.abs(b.priceMinor - product.priceMinor) || b.rating - a.rating,
    )
    .slice(0, Math.max(0, n));
  if (!near.length) return [];
  const insights = await getInsights(db, [product.id, ...near.map((p) => p.id)]);
  const pct = pricePercentiles([product, ...pool]);
  const cfg = decisionConfig(product.category);
  const baseScores = scoresFor(product, insights.get(product.id), pct.get(product.id) ?? 0.5, cfg);
  const w = weights ?? cfg.defaultWeights;
  const ranked = rankProducts(near, insights, w, { config: cfg });
  const order = new Map(near.map((p, i) => [p.id, i]));
  return ranked
    .sort((a, b) => order.get(a.product.id)! - order.get(b.product.id)!)
    .map((r) => ({
      ...r,
      priceDeltaMinor: r.product.priceMinor - product.priceMinor,
      diff: diffLine(product, r.product, baseScores, scoresFor(r.product, r.insight, pct.get(r.product.id) ?? 0.5, cfg)),
    }));
}

/** Where accessories for a category come from. */
const ACCESSORY_CATEGORIES: Record<string, string[]> = {
  electronics: ['electronics', 'mobiles'],
  wearables: ['wearables', 'electronics'],
  computers: ['electronics', 'computers'],
  mobiles: ['electronics', 'mobiles', 'wearables'],
  'home-kitchen': ['home-kitchen', 'kitchen-appliances'],
  'kitchen-appliances': ['kitchen-appliances', 'home-kitchen'],
  fashion: ['fashion', 'sports'],
  beauty: ['beauty'],
  books: ['books'],
  toys: ['toys', 'books'],
  sports: ['sports', 'yoga', 'fashion'],
  yoga: ['yoga', 'sports'],
};

/** Round a price up to a friendly ceiling: 1/2/2.5/5 × 10^k major units (minor in, minor out). */
export function niceCeiling(minor: number): number {
  const major = Math.max(minor / 100, 1);
  const mag = 10 ** Math.floor(Math.log10(major));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v > major) ?? 10 * mag;
  return Math.round(step * 100);
}

export interface Accessory {
  product: Product;
  /** e.g. "Goes with your Sony WH-1000XM5 · under ₹1,000" */
  reason: string;
}

/**
 * Up to `n` cheap add-ons for a cart: popular in-stock products from related
 * categories priced at ≤ 30% of the priciest cart item they pair with, not
 * already in the cart. Each carries a short reason line.
 */
export async function accessoriesFor(cartProducts: Product[], n = 4, c?: Db): Promise<Accessory[]> {
  if (!cartProducts.length) return [];
  const db = await client(c);
  const market = cartProducts[0].market;
  const inCart = new Set(cartProducts.map((p) => p.id));
  // anchor per related category: the priciest cart product that maps to it
  const anchors = new Map<string, Product>();
  for (const p of [...cartProducts].sort((a, b) => b.priceMinor - a.priceMinor)) {
    for (const cat of ACCESSORY_CATEGORIES[p.category] ?? [p.category]) if (!anchors.has(cat)) anchors.set(cat, p);
  }
  const pools = await Promise.all(
    [...anchors.keys()].map((cat) => listProducts(db, market, { category: cat, order: 'popular', limit: 24 })),
  );
  const out: Accessory[] = [];
  const seen = new Set<string>();
  const cats = [...anchors.keys()];
  // round-robin across categories so one department doesn't take every slot
  const lists = pools.map((pool, i) => {
    const anchor = anchors.get(cats[i])!;
    const cap = Math.max(anchor.priceMinor * 0.3, 1);
    const anchorKind = productKind(anchor.title);
    // a cheaper thing of the same sort is an alternative, not an accessory
    return pool
      .filter((p) => !inCart.has(p.id) && p.stock > 0 && p.priceMinor <= cap)
      .filter((p) => !kindMatch(anchorKind, productKind(p.title)))
      .map((p) => ({ p, anchor, cap }));
  });
  for (let round = 0; out.length < n && lists.some((l) => l.length > round); round++) {
    for (const l of lists) {
      const hit = l[round];
      if (!hit || seen.has(hit.p.id) || out.length >= n) continue;
      seen.add(hit.p.id);
      const ceiling = formatMoney(niceCeiling(hit.p.priceMinor), hit.p.curBase);
      out.push({ product: hit.p, reason: `Goes with your ${shortTitle(hit.anchor.title)} · under ${ceiling}` });
    }
  }
  return out;
}

export interface BundleItem extends Accessory {
  /** `orders`: shoppers bought them together; `rules`: a likely accessory (no order signal yet) */
  source: 'orders' | 'rules';
}

/**
 * "Frequently bought together" for a product page: what shoppers put in the same order (from
 * `bought_together()`, which needs two different shoppers per pair), topped up with likely
 * accessories while there aren't enough orders. In stock, same store, never the product's own
 * options.
 */
export async function boughtTogether(product: Product, n = 2, c?: Db): Promise<BundleItem[]> {
  if (product.archived || product.stock <= 0) return [];
  const db = await client(c);
  const res = await db.rpc('bought_together', { p_product_id: product.id, p_limit: n });
  const pairs = res.error ? [] : ((res.data ?? []) as { id: string; shoppers: number }[]); // not migrated yet: rules only
  const sameGroup = (p: Product) => Boolean(product.variant && p.variant?.group === product.variant.group);
  const bought = (await getProducts(db, pairs.map((x) => x.id)))
    .filter((p) => p.market === product.market && p.stock > 0 && !p.archived && !sameGroup(p))
    .map((p): BundleItem => ({ product: p, reason: 'Often bought together', source: 'orders' }));
  const out = foldVariants(bought, (b) => b.product).slice(0, n);
  if (out.length < n) {
    const have = new Set([product.id, ...out.map((b) => b.product.id)]);
    for (const a of await accessoriesFor([product], n + 2, db)) {
      if (out.length >= n) break;
      if (have.has(a.product.id) || sameGroup(a.product)) continue;
      have.add(a.product.id);
      out.push({ ...a, source: 'rules' });
    }
  }
  return out;
}
