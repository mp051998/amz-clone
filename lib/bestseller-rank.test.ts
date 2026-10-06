import { beforeEach, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';

const state = vi.hoisted(() => ({ list: [] as Partial<Product>[], asked: [] as unknown[] }));

vi.mock('@/lib/data/catalog', () => ({
  listProducts: async (_db: unknown, market: string, opts: unknown) => {
    state.asked.push({ market, opts });
    return state.list;
  },
}));

import { bestsellerRank } from './bestseller-rank';

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
