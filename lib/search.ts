import type { CurrencyCode } from './contracts';
import type { BudgetRange } from './decision/attributes';
import { formatMoney } from './marketplaces';
import type { Product } from './types';

// URL <-> query helpers for /s. The search itself runs in the database
// (search_catalog RPC via lib/data/catalog.ts).

export const PAGE_SIZE = 16;

export type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'review' | 'newest' | 'bestsellers';
export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'featured', label: 'Featured' },
  { key: 'price-asc', label: 'Price: Low to High' },
  { key: 'price-desc', label: 'Price: High to Low' },
  { key: 'review', label: 'Avg. Customer Review' },
  { key: 'newest', label: 'Newest Arrivals' },
  { key: 'bestsellers', label: 'Best Sellers' },
];

export interface SearchQuery {
  k?: string;
  dept?: string;
  brand?: string[];
  /** "Seller": sold by any of these (`seller=a|b`; names can hold commas) */
  seller?: string[];
  /** "Size": comes in any of these (`size=M,L`) */
  size?: string[];
  rating?: number;
  deal?: boolean;
  /** "Climate Pledge Friendly": only products with a sustainability certification (`climate=1`) */
  climate?: boolean;
  /** lowest price, minor units */
  minPrice?: number;
  /** highest price, minor units */
  maxPrice?: number;
  /** "Include Out of Stock": products with none left are left out unless this is set (`oos=1`) */
  includeOutOfStock?: boolean;
  /** "Discount": only products on sale for at least this percentage off (`pct`) */
  minDiscount?: number;
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
  /** sellers in the same scope, with counts */
  sellerFacets: { name: string; count: number }[];
  /** sizes in the same scope, with counts, in size-chart order */
  sizeFacets: { name: string; count: number }[];
  /** how many in the same scope are Climate Pledge Friendly, each variant group once */
  climateCount?: number;
  /** matches with no option in stock, each variant group once (left out unless `includeOutOfStock`) */
  unavailable: number;
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
  const sellerRaw = one(sp.seller);
  const sizeRaw = one(sp.size);
  const sortRaw = one(sp.sort) as SortKey | undefined;
  const rating = Number(one(sp.rating));
  const pct = Number(one(sp.pct));
  const price = (v: string | string[] | undefined) => {
    const n = Number(one(v));
    return Number.isSafeInteger(n) && n > 0 ? n : undefined;
  };
  return {
    k: one(sp.k)?.trim() || undefined,
    dept: one(sp.dept) || undefined,
    brand: brandRaw ? brandRaw.split(',').filter(Boolean) : undefined,
    seller: sellerRaw ? readSellers(sellerRaw) : undefined,
    size: sizeRaw ? readSizes(sizeRaw) : undefined,
    rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : undefined,
    deal: one(sp.deal) === '1' || undefined,
    climate: one(sp.climate) === '1' || undefined,
    minPrice: price(sp.min),
    maxPrice: price(sp.max),
    includeOutOfStock: one(sp.oos) === '1' || undefined,
    minDiscount: Number.isInteger(pct) && pct >= 1 && pct <= 99 ? pct : undefined,
    sort: SORTS.some((s) => s.key === sortRaw) ? (sortRaw as SortKey) : 'featured',
    page: Math.max(1, Number(one(sp.page)) || 1),
  };
}

/** Separates sellers in `seller=` (seller names can hold commas, unlike brands). */
export const SELLER_SEPARATOR = '|';

function readSellers(raw: string): string[] | undefined {
  const names = [...new Set(raw.split(SELLER_SEPARATOR).map((s) => s.trim().slice(0, 120)).filter(Boolean))].slice(0, 20);
  return names.length ? names : undefined;
}

/** Sizes in `size=`: comma-separated, as the admin form takes them (a size is at most 12 characters). */
function readSizes(raw: string): string[] | undefined {
  const sizes = [...new Set(raw.split(',').map((s) => s.trim()).filter((s) => s && s.length <= 12))].slice(0, 20);
  return sizes.length ? sizes : undefined;
}

const LETTER_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

/**
 * Size-chart order for the "Size" facet: letter sizes small to large (S, M, L, XL…), then
 * numbered sizes by number ("6", "UK 7", "10.5"), grouped by any prefix, then anything else
 * alphabetically.
 */
export function compareSizes(a: string, b: string): number {
  const key = (s: string): [number, string, number] => {
    const letter = LETTER_SIZES.indexOf(s.toUpperCase());
    if (letter >= 0) return [0, '', letter];
    const m = /^(.*?)\s*(\d+(?:\.\d+)?)$/.exec(s);
    if (m) return [1, m[1].toUpperCase(), Number(m[2])];
    return [2, s.toUpperCase(), 0];
  };
  const [ga, pa, na] = key(a);
  const [gb, pb, nb] = key(b);
  return ga - gb || pa.localeCompare(pb) || na - nb || a.localeCompare(b);
}

/** The "Discount" filter's choices, percent off ("10% off or more"). */
export const DISCOUNTS = [10, 25, 50, 70] as const;

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

/** A "Price" filter choice: `min`/`max` in minor units, null when open-ended. */
export interface PricePreset {
  label: string;
  min: number | null;
  max: number | null;
}

/** Round price points (major units) the "Price" filter picks its boundaries from. */
const PRICE_POINTS: Record<CurrencyCode, number[]> = {
  USD: [10, 25, 50, 100, 200, 500, 1000, 2000, 5000],
  INR: [100, 250, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000, 200_000],
};

/** "$50", "₹1,000": whole amounts without cents. */
const wholeMoney = (minor: number, currency: CurrencyCode) => formatMoney(minor, currency).replace(/\.00$/, '');

/**
 * Amazon-style price buckets for a department's budget range: "Under $25", "$25 to $50", …,
 * "$200 & above". Boundaries are round price points strictly inside the range that the budget
 * slider can land on (multiples of its step), at most `most` of them, spread evenly.
 */
export function pricePresets(range: BudgetRange, most = 4): PricePreset[] {
  const inside = PRICE_POINTS[range.currency]
    .map((major) => major * 100)
    .filter((m) => m > range.minMinor && m < range.maxMinor && m % range.stepMinor === 0);
  const cuts =
    inside.length <= most ? inside : Array.from({ length: most }, (_, i) => inside[Math.round((i * (inside.length - 1)) / (most - 1))]);
  if (!cuts.length) return [];
  const money = (m: number) => wholeMoney(m, range.currency);
  return [
    { label: `Under ${money(cuts[0])}`, min: null, max: cuts[0] },
    ...cuts.slice(1).map((max, i) => ({ label: `${money(cuts[i])} to ${money(max)}`, min: cuts[i], max })),
    { label: `${money(cuts[cuts.length - 1])} & above`, min: cuts[cuts.length - 1], max: null },
  ];
}
