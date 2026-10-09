import type { Db } from '../db/client';
import type { Category, Market } from '../types';
import { listProducts } from './catalog';

export interface DepartmentTile {
  slug: string;
  name: string;
  /** the department's most-reviewed product's image */
  image: string;
}

/**
 * Home's "Shop by department": each of the store's departments, in nav order, pictured by its
 * most-reviewed product on sale. A department with nothing on sale, or whose lookup fails, is left
 * out.
 */
export async function departmentTiles(db: Db, market: Market, categories: readonly Category[]): Promise<DepartmentTile[]> {
  const tops = await Promise.all(categories.map((c) => listProducts(db, market, { category: c.slug, order: 'popular', limit: 1 }).catch(() => [])));
  return categories.flatMap((c, i) => {
    const top = tops[i][0];
    return top ? [{ slug: c.slug, name: c.name, image: top.image }] : [];
  });
}
