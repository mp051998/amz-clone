// Market-aware catalog hub. amazon.com and amazon.in have fully separate product
// catalogs (different products, brands, sellers, images, native prices); this module
// picks the right one per marketplace and exposes the selection/lookup helpers the app
// uses. The generated data lives in ./catalog (US) and ./catalog-in (IN).
import { products as productsUS, categories as baseCategories, type Product, type Category } from './catalog';
import { productsIN } from './catalog-in';

export type Market = 'US' | 'IN';
export type { Product, Category };

// amazon.in carries a dedicated "Mobiles" department (its own top-nav entry);
// amazon.com folds phones into Electronics, so Mobiles is India-only.
const IN_ONLY_CATEGORIES: Category[] = [{ slug: 'mobiles', name: 'Mobiles' }];

/** categories shown for a market. IN leads with Mobiles (mirrors amazon.in nav). */
export const categoriesFor = (market: Market): Category[] =>
  market === 'IN' ? [...IN_ONLY_CATEGORIES, ...baseCategories] : baseCategories;

const ALL_CATEGORIES: Category[] = [...baseCategories, ...IN_ONLY_CATEGORIES];
/** every valid category slug across both markets (for href validation). */
export const allCategorySlugs = new Set(ALL_CATEGORIES.map((c) => c.slug));
export const categoryName = (slug: string): string =>
  ALL_CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;

// base list (both markets) — kept for callers that don't vary by market.
export const categories = baseCategories;

function catalogFor(market: Market): Product[] {
  return market === 'IN' ? productsIN : productsUS;
}

// Union lookup across both catalogs — ids are unique across markets (IN ids are
// `in-`-prefixed), so a cart/order id resolves regardless of the active store.
const byId = new Map<string, Product>([...productsUS, ...productsIN].map((p) => [p.id, p]));
export const getProduct = (id: string): Product | undefined => byId.get(id);

export const productsIn = (slug: string, market: Market): Product[] =>
  catalogFor(market).filter((p) => p.category === slug);

export const deals = (market: Market): Product[] =>
  catalogFor(market).filter((p) => p.deal && p.dealPct);

export function searchProducts(q: string, market: Market): Product[] {
  const list = catalogFor(market);
  const t = q.trim().toLowerCase();
  if (!t) return list;
  const terms = t.split(/\s+/);
  return list.filter((p) => {
    const hay = (p.title + ' ' + (p.brand ?? '') + ' ' + categoryName(p.category)).toLowerCase();
    return terms.every((w) => hay.includes(w));
  });
}

/** all products for a market (unfiltered) — base scope for search with no query/dept. */
export const allProducts = (market: Market): Product[] => catalogFor(market);
