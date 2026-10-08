import { beforeEach, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';

const state = vi.hoisted(() => ({ list: [] as Partial<Product>[], asked: [] as unknown[] }));

vi.mock('@/lib/data/catalog', () => ({
  listProducts: async (_db: unknown, market: string, opts: unknown) => {
    state.asked.push({ market, opts });
    return state.list;
  },
}));

import { bestsellerRank, isTopSeller, topSellers } from './bestseller-rank';

const db = {} as never;

beforeEach(() => {
  state.list = [{ id: 'a' }, { id: 'b', variant: { group: 'g1', axis: 'Colour', label: 'Black' } }, { id: 'c' }];
  state.asked = [];
});

it("ranks a product in its department's bestseller order", async () => {
  expect(await bestsellerRank(db, { id: 'c', market: 'IN', category: 'audio' })).toBe(3);
  expect(state.asked).toEqual([{ market: 'IN', opts: { category: 'audio', order: 'popular', limit: 100 } }]);
  expect(await bestsellerRank(db, { id: 'a', market: 'US', category: 'audio' })).toBe(1);
});

it('a variant option shares its group card’s rank', async () => {
  expect(await bestsellerRank(db, { id: 'b-white', market: 'US', category: 'audio', variant: { group: 'g1', axis: 'Colour', label: 'White' } })).toBe(2);
});

it('no rank outside the list', async () => {
  expect(await bestsellerRank(db, { id: 'z', market: 'US', category: 'audio' }, 3)).toBeNull();
});

it("finds each department's #1 once, however many of its products are on the page", async () => {
  const tops = await topSellers(db, 'US', ['audio', 'audio', 'kitchen']);
  expect(state.asked).toEqual([
    { market: 'US', opts: { category: 'audio', order: 'popular', limit: 1 } },
    { market: 'US', opts: { category: 'kitchen', order: 'popular', limit: 1 } },
  ]);
  expect(isTopSeller({ id: 'a', category: 'audio' }, tops)).toBe(true);
  expect(isTopSeller({ id: 'c', category: 'audio' }, tops)).toBe(false);
  // the same product filed under another department isn't that department's #1
  expect(isTopSeller({ id: 'a', category: 'toys' }, tops)).toBe(false);
});

it('another option of the #1 card is the #1 too', async () => {
  state.list = [{ id: 'b', variant: { group: 'g1', axis: 'Colour', label: 'Black' } }];
  const tops = await topSellers(db, 'US', ['audio']);
  expect(isTopSeller({ id: 'b-white', category: 'audio', variant: { group: 'g1', axis: 'Colour', label: 'White' } }, tops)).toBe(true);
  expect(isTopSeller({ id: 'x', category: 'audio', variant: { group: 'g2', axis: 'Colour', label: 'White' } }, tops)).toBe(false);
});

it('a department with nothing listed has no #1', async () => {
  state.list = [];
  expect((await topSellers(db, 'US', ['audio'])).size).toBe(0);
});
