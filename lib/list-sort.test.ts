import { expect, it } from 'vitest';
import { product } from '@/test/fixtures/decision';
import type { ListPriority } from './decision/types';
import { parseListSort, sortList } from './list-sort';

// newest first, as lists come
const items = [
  { product: product({ id: 'a', priceMinor: 3000 }), priority: 'low' as ListPriority },
  { product: product({ id: 'b', priceMinor: 1000 }), priority: 'highest' as ListPriority },
  { product: product({ id: 'c', priceMinor: 5000, archived: true }) },
  { product: product({ id: 'd', priceMinor: 1000 }), priority: 'highest' as ListPriority },
  { product: product({ id: 'e', priceMinor: 9000 }), priority: 'lowest' as ListPriority },
];
const ids = (xs: { product: { id: string } }[]) => xs.map((x) => x.product.id);

it('keeps the date added, newest first, by default', () => {
  expect(ids(sortList(items, 'added'))).toEqual(['a', 'b', 'c', 'd', 'e']);
});

it('puts the highest priority first, medium when none is set, newest first within one', () => {
  expect(ids(sortList(items, 'priority'))).toEqual(['b', 'd', 'c', 'a', 'e']);
});

it('sorts by price either way, newest first at the same price, products off sale last', () => {
  expect(ids(sortList(items, 'price-asc'))).toEqual(['b', 'd', 'a', 'e', 'c']);
  expect(ids(sortList(items, 'price-desc'))).toEqual(['e', 'a', 'b', 'd', 'c']);
});

it('leaves the list as it was', () => {
  sortList(items, 'price-asc');
  expect(ids(items)).toEqual(['a', 'b', 'c', 'd', 'e']);
});

it('reads ?sort=, falling back to date added', () => {
  expect(['priority', 'price-asc', 'price-desc', 'added', 'rating', undefined, ['priority']].map(parseListSort)).toEqual([
    'priority',
    'price-asc',
    'price-desc',
    'added',
    'added',
    'added',
    'added',
  ]);
});
