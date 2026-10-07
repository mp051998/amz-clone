import { beforeEach, expect, it, vi } from 'vitest';
import type { Db } from '../db/client';
import type { Product } from '../types';
import { alsoViewed, recordView } from './also-viewed';

const getProducts = vi.fn();
vi.mock('./catalog', () => ({ getProducts: (...args: unknown[]) => getProducts(...args) }));

const product = (id: string, more: Partial<Product> = {}) => ({ id, market: 'US', archived: undefined, ...more }) as Product;

function fakeDb(data: unknown, error: unknown = null) {
  const calls: [string, object][] = [];
  const db = { rpc: async (fn: string, args: object) => (calls.push([fn, args]), { data, error }) } as unknown as Db;
  return { db, calls };
}

beforeEach(() => getProducts.mockReset());

it('counts a view with up to 5 other products looked at before it, once each', async () => {
  const { db, calls } = fakeDb(null);
  await recordView(db, 'a', ['b', 'a', 'b', 'c', 'd', 'e', 'f', 'g']);
  expect(calls).toEqual([['record_product_view', { p_product_id: 'a', p_recent: ['b', 'c', 'd', 'e', 'f'] }]]);
});

it('records nothing without other products, and refuses what isn’t a list of ids', async () => {
  const { db, calls } = fakeDb(null);
  await recordView(db, 'a', undefined);
  await recordView(db, 'a', ['a']);
  expect(calls).toHaveLength(0);
  for (const bad of ['b', [1], ['has space'], Array.from({ length: 31 }, (_, i) => `p${i}`)]) {
    await expect(recordView(db, 'a', bad)).rejects.toMatchObject({ code: 'invalid_input', detail: 'recent' });
  }
});

it('lists this store’s products on sale viewed with it, one per variant group, most views first', async () => {
  const { db, calls } = fakeDb([{ id: 'b', views: 9 }, { id: 'c', views: 5 }, { id: 'd', views: 3 }, { id: 'e', views: 2 }, { id: 'f', views: 1 }]);
  getProducts.mockResolvedValue([
    product('b', { variant: { group: 'g', axis: 'Color', label: 'Red' } }),
    product('c', { variant: { group: 'g', axis: 'Color', label: 'Blue' } }),
    product('d', { archived: true }),
    product('e', { market: 'IN' }),
    product('f'),
  ]);
  const got = await alsoViewed(db, product('a'), 8);
  expect(calls).toEqual([['also_viewed', { p_product_id: 'a', p_limit: 12 }]]);
  expect(getProducts).toHaveBeenCalledWith(db, ['b', 'c', 'd', 'e', 'f']);
  expect(got.map((p) => p.id)).toEqual(['b', 'f']);
});

it('is empty on an error', async () => {
  expect(await alsoViewed(fakeDb(null, { message: 'function does not exist' }).db, product('a'))).toEqual([]);
  expect(getProducts).not.toHaveBeenCalled();
});
