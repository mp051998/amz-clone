import { beforeEach, expect, it, vi } from 'vitest';
import type { Db } from '../db/client';
import type { Product } from '../types';
import { departmentTiles } from './department-tiles';

const listProducts = vi.fn();
vi.mock('./catalog', () => ({ listProducts: (...args: unknown[]) => listProducts(...args) }));

const db = {} as Db;

beforeEach(() => {
  listProducts.mockReset();
});

it('pictures each department by its most-reviewed product, in nav order, leaving out empty and failed ones', async () => {
  listProducts.mockImplementation(async (_db: Db, _market: string, opts: { category: string }) => {
    if (opts.category === 'books') return [];
    if (opts.category === 'toys') throw new Error('boom');
    return [{ id: `${opts.category}-1`, image: `/img/${opts.category}.jpg` } as Product];
  });
  const got = await departmentTiles(db, 'US', [
    { slug: 'electronics', name: 'Electronics' },
    { slug: 'books', name: 'Books' },
    { slug: 'toys', name: 'Toys & Games' },
    { slug: 'beauty', name: 'Beauty & Personal Care' },
  ]);
  expect(listProducts).toHaveBeenCalledWith(db, 'US', { category: 'electronics', order: 'popular', limit: 1 });
  expect(got).toEqual([
    { slug: 'electronics', name: 'Electronics', image: '/img/electronics.jpg' },
    { slug: 'beauty', name: 'Beauty & Personal Care', image: '/img/beauty.jpg' },
  ]);
});

it('is empty without departments', async () => {
  expect(await departmentTiles(db, 'IN', [])).toEqual([]);
  expect(listProducts).not.toHaveBeenCalled();
});
