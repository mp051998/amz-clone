// Market-aware catalog hub. amazon.com and amazon.in have fully separate product
// catalogs (different products, brands, sellers, images, native prices); this module
// picks the right one per marketplace and exposes the selection/lookup helpers the app
// uses. The generated data lives in ./catalog (US) and ./catalog-in (IN).
import { products as productsUS, categories, categoryName, type Product, type Category } from './catalog';
import { productsIN } from './catalog-in';

export type Market = 'US' | 'IN';
export type { Product, Category };
export { categories, categoryName };

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
