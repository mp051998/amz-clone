import { beforeEach, expect, it, vi } from 'vitest';
import type { Db } from '../db/client';
import type { Product } from '../types';
import { alsoBought } from './also-bought';

const getProducts = vi.fn();
vi.mock('./catalog', () => ({ getProducts: (...args: unknown[]) => getProducts(...args) }));

const product = (id: string, more: Partial<Product> = {}) => ({ id, market: 'US', archived: undefined, ...more }) as Product;

function fakeDb(data: unknown, error: unknown = null) {
  const calls: [string, object][] = [];
  const db = { rpc: async (fn: string, args: object) => (calls.push([fn, args]), { data, error }) } as unknown as Db;
  return { db, calls };
}

beforeEach(() => getProducts.mockReset());

it('lists this store’s products on sale its buyers bought too, one per variant group, most buyers first', async () => {
  const { db, calls } = fakeDb([{ id: 'b', shoppers: 9 }, { id: 'c', shoppers: 5 }, { id: 'd', shoppers: 3 }, { id: 'e', shoppers: 2 }, { id: 'a', shoppers: 2 }, { id: 'f', shoppers: 2 }]);
  getProducts.mockResolvedValue([
    product('b', { variant: { group: 'g', axis: 'Color', label: 'Red' } }),
    product('c', { variant: { group: 'g', axis: 'Color', label: 'Blue' } }),
    product('d', { archived: true }),
    product('e', { market: 'IN' }),
    product('a'),
    product('f'),
  ]);
  const got = await alsoBought(db, product('a'), 8);
  expect(calls).toEqual([['also_bought', { p_product_id: 'a', p_limit: 12 }]]);
  expect(getProducts).toHaveBeenCalledWith(db, ['b', 'c', 'd', 'e', 'a', 'f']);
  expect(got.map((p) => p.id)).toEqual(['b', 'f']);
});

it('stops at n', async () => {
  const { db, calls } = fakeDb([{ id: 'b', shoppers: 3 }, { id: 'c', shoppers: 2 }]);
  getProducts.mockResolvedValue([product('b'), product('c')]);
  expect((await alsoBought(db, product('a'), 1)).map((p) => p.id)).toEqual(['b']);
  expect(calls[0][1]).toEqual({ p_product_id: 'a', p_limit: 5 });
});

it('is empty on an error', async () => {
  expect(await alsoBought(fakeDb(null, { message: 'function does not exist' }).db, product('a'))).toEqual([]);
  expect(getProducts).not.toHaveBeenCalled();
});
