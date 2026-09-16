import { products, productsIn, searchProducts, categoryName, type Product } from './catalog';

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
  pageCount: number;
  /** brands available in the query+dept scope, with counts */
  brandFacets: { name: string; count: number }[];
  headingLabel: string;
}

const badgeRank = (p: Product) => (p.badge === "Amazon's Choice" ? 0 : p.badge === 'Best Seller' ? 1 : p.badge === 'Overall Pick' ? 2 : 3);

export function parseQuery(sp: Record<string, string | string[] | undefined>): SearchQuery {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const brandRaw = one(sp.brand);
  const sortRaw = one(sp.sort) as SortKey | undefined;
  return {
    k: one(sp.k)?.trim() || undefined,
    dept: one(sp.dept) || undefined,
    brand: brandRaw ? brandRaw.split(',').filter(Boolean) : undefined,
    rating: one(sp.rating) ? Number(one(sp.rating)) : undefined,
    deal: one(sp.deal) === '1' || undefined,
    sort: SORTS.some((s) => s.key === sortRaw) ? (sortRaw as SortKey) : 'featured',
    page: Math.max(1, Number(one(sp.page)) || 1),
  };
}

export function runSearch(q: SearchQuery): SearchResult {
  // base scope: text query, else department, else everything
  let base: Product[] = q.k ? searchProducts(q.k) : q.dept ? productsIn(q.dept) : products;
  if (q.k && q.dept) base = base.filter((p) => p.category === q.dept);

  // brand facets from the scope (before applying brand filter) so the list stays stable
  const brandCounts = new Map<string, number>();
  for (const p of base) if (p.brand) brandCounts.set(p.brand, (brandCounts.get(p.brand) ?? 0) + 1);
  const brandFacets = [...brandCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // filters
  let items = base;
  if (q.brand?.length) items = items.filter((p) => p.brand && q.brand!.includes(p.brand));
  if (q.rating) items = items.filter((p) => p.rating >= q.rating!);
  if (q.deal) items = items.filter((p) => p.deal);

  // sort
  items = [...items];
  switch (q.sort) {
    case 'price-asc': items.sort((a, b) => a.priceMinor - b.priceMinor); break;
    case 'price-desc': items.sort((a, b) => b.priceMinor - a.priceMinor); break;
    case 'review': items.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount); break;
    case 'newest': items.reverse(); break;
    default: items.sort((a, b) => badgeRank(a) - badgeRank(b) || b.reviewCount - a.reviewCount);
  }

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(q.page, pageCount);
  const start = (page - 1) * PAGE_SIZE;
  const paged = items.slice(start, start + PAGE_SIZE);

  const headingLabel = q.k
    ? `"${q.k}"`
    : q.dept
      ? categoryName(q.dept)
      : 'All departments';

  return { query: { ...q, page }, items: paged, total, pageCount, brandFacets, headingLabel };
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
