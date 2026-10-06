import type { Product } from './types';

// URL <-> query helpers for /s. The search itself runs in the database
// (search_catalog RPC via lib/data/catalog.ts).

export const PAGE_SIZE = 16;

export type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'review' | 'newest';
export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'featured', label: 'Featured' },
  { key: 'price-asc', label: 'Price: Low to High' },
  { key: 'price-desc', label: 'Price: High to Low' },
  { key: 'review', label: 'Avg. Customer Review' },
  { key: 'newest', label: 'Newest Arrivals' },
];

export interface SearchQuery {
  k?: string;
  dept?: string;
  brand?: string[];
  rating?: number;
  deal?: boolean;
  sort: SortKey;
  page: number;
}

export interface SearchResult {
  query: SearchQuery;
  items: Product[];
  total: number;
  /** `total` counting each variant group once (one card per group) */
  groups: number;
  pageCount: number;
  /** brands available in the query+dept scope, with counts */
  brandFacets: { name: string; count: number }[];
  headingLabel: string;
}

/** Search-as-you-type for what's been typed so far (`/api/v1/suggest`, `search_suggest()`). */
export interface Suggestions {
  /** matching products, each variant group once */
  total: number;
  /** completions of the last word typed, as whole queries, most common first */
  terms: { text: string; count: number }[];
  departments: { slug: string; name: string; count: number }[];
  /** the best-reviewed matches, one per variant group */
  products: { id: string; title: string; image: string | null }[];
}

export const NO_SUGGESTIONS: Suggestions = { total: 0, terms: [], departments: [], products: [] };

/** Suggestions start at two letters or digits. */
export const SUGGEST_MIN = 2;

export function parseQuery(sp: Record<string, string | string[] | undefined>): SearchQuery {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const brandRaw = one(sp.brand);
  const sortRaw = one(sp.sort) as SortKey | undefined;
  const rating = Number(one(sp.rating));
  return {
    k: one(sp.k)?.trim() || undefined,
    dept: one(sp.dept) || undefined,
    brand: brandRaw ? brandRaw.split(',').filter(Boolean) : undefined,
    rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : undefined,
    deal: one(sp.deal) === '1' || undefined,
    sort: SORTS.some((s) => s.key === sortRaw) ? (sortRaw as SortKey) : 'featured',
    page: Math.max(1, Number(one(sp.page)) || 1),
  };
}

/** build an /s href from a params object (drops empty values, resets page unless kept) */
export function buildHref(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val === undefined || val === null || val === '') continue;
    usp.set(key, String(val));
  }
  const qs = usp.toString();
  return qs ? `/s?${qs}` : '/s';
}
