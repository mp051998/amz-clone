import { beforeEach, expect, it, vi } from 'vitest';
import type { Db } from '../db/client';
import type { Product } from '../types';
import { alsoViewed, inspiredBy, recordView } from './also-viewed';

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

function perAnchorDb(byId: Record<string, unknown>) {
  const calls: [string, object][] = [];
  const db = {
    rpc: async (fn: string, args: { p_product_id: string }) => {
      calls.push([fn, args]);
      const data = byId[args.p_product_id];
      return data instanceof Error ? { data: null, error: { message: data.message } } : { data: data ?? [], error: null };
    },
  } as unknown as Db;
  return { db, calls };
}

it('is inspired by the latest 3 products viewed: most views across them first, none from the history', async () => {
  const { db, calls } = perAnchorDb({
    a: [{ id: 'x', views: 2 }, { id: 'b', views: 9 }, { id: 'y', views: 1 }],
    b: [{ id: 'y', views: 4 }, { id: 'z', views: 1 }],
    c: new Error('boom'),
  });
  getProducts.mockResolvedValue([product('a'), product('b'), product('c'), product('y', { stock: 3 }), product('x', { stock: 3 }), product('z', { stock: 3 })]);
  const got = await inspiredBy(db, 'US', ['a', 'b', 'c', 'd'], 8);
  expect(calls.map(([, args]) => args)).toEqual(['a', 'b', 'c'].map((id) => ({ p_product_id: id, p_limit: 12 })));
  expect(getProducts).toHaveBeenCalledWith(db, ['a', 'b', 'c', 'y', 'x', 'z']);
  expect(got.map((p) => p.id)).toEqual(['y', 'x', 'z']);
});

it('keeps to this store’s products in stock, one per variant group, none in a viewed product’s group', async () => {
  const { db } = perAnchorDb({ a: [{ id: 'b', views: 6 }, { id: 'c', views: 5 }, { id: 'd', views: 4 }, { id: 'e', views: 3 }, { id: 'f', views: 2 }, { id: 'g', views: 1 }, { id: 'h', views: 1 }] });
  const group = (g: string) => ({ variant: { group: g, axis: 'Color', label: g } });
  getProducts.mockResolvedValue([
    product('a', group('mine')),
    product('b', { stock: 2, ...group('mine') }),
    product('c', { stock: 0 }),
    product('d', { stock: 2, market: 'IN' }),
    product('e', { stock: 2, archived: true }),
    product('f', { stock: 2, ...group('g1') }),
    product('g', { stock: 2, ...group('g1') }),
    product('h', { stock: 2 }),
  ]);
  expect((await inspiredBy(db, 'US', ['a'], 1)).map((p) => p.id)).toEqual(['f']);
  expect((await inspiredBy(db, 'US', ['a'])).map((p) => p.id)).toEqual(['f', 'h']);
});

it('has nothing to go on without a history, or when nothing was viewed with it', async () => {
  const { db, calls } = perAnchorDb({});
  expect(await inspiredBy(db, 'US', [])).toEqual([]);
  expect(calls).toHaveLength(0);
  expect(await inspiredBy(db, 'US', ['a'])).toEqual([]);
  expect(getProducts).not.toHaveBeenCalled();
});

it('doesn’t start from a product left out of recommendations, but still leaves it out of what it shows', async () => {
  const { db, calls } = perAnchorDb({ b: [{ id: 'a', views: 5 }, { id: 'y', views: 2 }] });
  getProducts.mockResolvedValue([product('b'), product('a', { stock: 2 }), product('y', { stock: 2 })]);
  const got = await inspiredBy(db, 'US', ['a', 'b'], 8, new Set(['a']));
  expect(calls.map(([, args]) => args)).toEqual([{ p_product_id: 'b', p_limit: 12 }]);
  expect(got.map((p) => p.id)).toEqual(['y']);
});
