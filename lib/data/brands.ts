import type { Db } from '../db/client';
import type { Market, Product } from '../types';
import { listProducts } from './catalog';

/** A brand's store page, as Amazon's "Visit the Sony Store" leads to. */
export interface BrandStore {
  brand: string;
  /** products on sale here, one per variant group */
  count: number;
  /** the most popular first (up to `BRAND_SECTION`) */
  bestSellers: Product[];
  /** on Today's Deals now, the deepest first (up to `BRAND_SECTION`) */
  deals: Product[];
  /** its departments, the one with the most products first: how many it has, and its most popular (up to `BRAND_SECTION`) */
  departments: { slug: string; name: string; count: number; products: Product[] }[];
}

/** the most products a section of the store shows; "See all" searches the rest. */
export const BRAND_SECTION = 8;
/** the most of a brand's products one page reads. */
export const BRAND_PRODUCTS_MAX = 200;

/** Lay out a brand's products (most popular first) as its store. Pure. */
export function brandStoreOf(brand: string, products: readonly Product[]): BrandStore {
  const departments = new Map<string, { slug: string; name: string; count: number; products: Product[] }>();
  for (const p of products) {
    const d = departments.get(p.category) ?? { slug: p.category, name: p.categoryName, count: 0, products: [] };
    d.count += 1;
    if (d.products.length < BRAND_SECTION) d.products.push(p);
    departments.set(p.category, d);
  }
  return {
    brand,
    count: products.length,
    bestSellers: products.slice(0, BRAND_SECTION),
    deals: products
      .filter((p) => p.deal && p.dealPct)
      .sort((a, b) => (b.dealPct ?? 0) - (a.dealPct ?? 0))
      .slice(0, BRAND_SECTION),
    // a tie keeps the order the brand's most popular product puts them in
    departments: [...departments.values()].sort((a, b) => b.count - a.count),
  };
}

/** A brand's store in this market, or null when nothing of the brand is on sale here. */
export async function brandStore(db: Db, market: Market, brand: string): Promise<BrandStore | null> {
  const name = brand.trim().slice(0, 120);
  if (!name) return null;
  const products = await listProducts(db, market, { brand: name, order: 'popular', limit: BRAND_PRODUCTS_MAX });
  return products.length ? brandStoreOf(products[0].brand ?? name, products) : null;
}
