import { expect, it } from 'vitest';
import { recAnchors, tidyRecs, type RecGroup } from './recommendations';
import type { Product } from './types';

const product = (id: string, more: Partial<Product> = {}) => ({ id, market: 'US', stock: 5, archived: undefined, ...more }) as Product;

it('starts from the newest products in this store on sale, leaving out the ones asked not to use', () => {
  const ps = [product('a'), product('b', { market: 'IN' }), product('c', { archived: true }), product('d'), product('e'), product('f')];
  expect(recAnchors(ps, new Set(['d']), 'US').map((p) => p.id)).toEqual(['a', 'e', 'f']);
  expect(recAnchors(ps, new Set(), 'US', 2).map((p) => p.id)).toEqual(['a', 'd']);
});

it('shows each product in stock once, none started from or bought, and drops rows left empty', () => {
  const groups: RecGroup[] = [
    { reason: 'viewed', anchor: product('a'), items: [product('x'), product('b'), product('y', { stock: 0 }), product('z')] },
    { reason: 'viewed', anchor: product('b'), items: [product('x'), product('a')] },
    { reason: 'bought', anchor: product('k'), items: [product('z'), product('w'), product('bought')] },
  ];
  const got = tidyRecs(groups, new Set(['k', 'bought']), 8);
  expect(got.map((g) => [g.anchor.id, g.items.map((p) => p.id)])).toEqual([
    ['a', ['x', 'z']],
    ['k', ['w']],
  ]);
  expect(tidyRecs(groups, new Set(), 1).map((g) => g.items.map((p) => p.id))).toEqual([['x'], ['z']]);
});
