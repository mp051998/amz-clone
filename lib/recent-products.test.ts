import { beforeEach, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';

const state = vi.hoisted(() => ({
  ids: [] as string[],
  asked: [] as string[][],
  fail: false,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/recent', () => ({ readRecentIds: async () => state.ids }));
vi.mock('@/lib/data/catalog', () => ({
  getProducts: async (_db: unknown, ids: string[]) => {
    state.asked.push(ids);
    if (state.fail) throw new Error('fetch failed');
    // like the real one: in the order asked, unknown/archived ids dropped
    return ids.filter((id) => id !== 'gone').map((id) => ({ id, market: id.startsWith('in-') ? 'IN' : 'US' }) as Product);
  },
}));

import { recentProducts } from './recent-products';

beforeEach(() => {
  state.ids = [];
  state.asked = [];
  state.fail = false;
});

it("keeps this store's products, newest first, minus the excluded ones", async () => {
  state.ids = ['a', 'in-x', 'b', 'gone', 'c'];
  const got = await recentProducts({} as never, 'US', { exclude: ['b'] });
  expect(got.map((p) => p.id)).toEqual(['a', 'c']);
  expect(state.asked).toEqual([['a', 'in-x', 'gone', 'c']]);
  expect((await recentProducts({} as never, 'IN')).map((p) => p.id)).toEqual(['in-x']);
});

it('stops at the limit (8 by default)', async () => {
  state.ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
  expect(await recentProducts({} as never, 'US')).toHaveLength(8);
  expect(await recentProducts({} as never, 'US', { limit: 3 })).toHaveLength(3);
});

it('a failed lookup is an empty row, not an error', async () => {
  state.ids = ['a'];
  state.fail = true;
  expect(await recentProducts({} as never, 'US')).toEqual([]);
});
