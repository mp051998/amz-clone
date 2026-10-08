import { LIST_PRIORITIES, type ListPriority } from './decision/types';
import type { Product } from './types';

/** How a list's items can be ordered, as on Amazon's lists. */
export const LIST_SORTS = ['added', 'priority', 'price-asc', 'price-desc'] as const;
export type ListSort = (typeof LIST_SORTS)[number];

export const LIST_SORT_LABEL: Record<ListSort, string> = {
  added: 'Date added',
  priority: 'Priority',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
};

/** `?sort=` as one of LIST_SORTS; anything else is the default, newest first. */
export function parseListSort(v: unknown): ListSort {
  return LIST_SORTS.includes(v as ListSort) ? (v as ListSort) : 'added';
}

/**
 * A list's items in the order picked. They come newest first, which `added` keeps, and the sort
 * is stable, so ties stay newest first. Under a price sort, products no longer on sale go last:
 * there's no price to buy them at.
 */
export function sortList<T extends { product: Product; priority?: ListPriority }>(items: readonly T[], sort: ListSort): T[] {
  const rank = (p: ListPriority | undefined) => LIST_PRIORITIES.indexOf(p ?? 'medium');
  const gone = (i: T) => Number(Boolean(i.product.archived));
  const compare: Record<ListSort, (a: T, b: T) => number> = {
    added: () => 0,
    priority: (a, b) => rank(b.priority) - rank(a.priority),
    'price-asc': (a, b) => gone(a) - gone(b) || a.product.priceMinor - b.product.priceMinor,
    'price-desc': (a, b) => gone(a) - gone(b) || b.product.priceMinor - a.product.priceMinor,
  };
  return items.slice().sort(compare[sort]);
}
