import { beforeEach, expect, it, vi } from 'vitest';
import type { Db } from '../db/client';
import type { Product } from '../types';
import { alsoBought, alsoBoughtWithCart } from './also-bought';

const getProducts = vi.fn();
vi.mock('./catalog', () => ({ getProducts: (...args: unknown[]) => getProducts(...args) }));

const product = (id: string, more: Partial<Product> = {}) => ({ id, market: 'US', archived: undefined, ...more }) as Product;

function fakeDb(data: unknown, error: unknown = null) {
  const calls: [string, object][] = [];
  const db = { rpc: async (fn: string, args: object) => (calls.push([fn, args]), { data, error }) } as unknown as Db;
  return { db, calls };
}

// a block body: a function returned from beforeEach runs as a cleanup hook
beforeEach(() => {
  getProducts.mockReset();
});

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

function cartDb(byProduct: Record<string, unknown>, failing: string[] = []) {
  const calls: [string, object][] = [];
  const db = {
    rpc: async (fn: string, args: { p_product_id: string }) => (
      calls.push([fn, args]),
      failing.includes(args.p_product_id) ? { data: null, error: { message: 'boom' } } : { data: byProduct[args.p_product_id] ?? [], error: null }
    ),
  } as unknown as Db;
  return { db, calls };
}

it('cart: adds up the buyers across the first few cart products, leaving out the cart and its variant groups', async () => {
  const { db, calls } = cartDb({
    a: [{ id: 'x', shoppers: 2 }, { id: 'y', shoppers: 4 }, { id: 'b', shoppers: 9 }],
    b: [{ id: 'x', shoppers: 3 }, { id: 'v2', shoppers: 8 }, { id: 'z', shoppers: 1 }],
  });
  getProducts.mockImplementation(async (_db: unknown, ids: string[]) =>
    ids.map((id) => (id === 'v2' ? product('v2', { stock: 5, variant: { group: 'g', axis: 'Color', label: 'Blue' } }) : product(id, { stock: id === 'z' ? 0 : 5 }))),
  );
  const cart = [product('a'), product('b'), product('v1', { variant: { group: 'g', axis: 'Color', label: 'Red' } })];
  const got = await alsoBoughtWithCart(db, 'US', cart, 8);
  expect(calls.map(([fn, args]) => [fn, (args as { p_product_id: string }).p_product_id])).toEqual([
    ['also_bought', 'a'],
    ['also_bought', 'b'],
    ['also_bought', 'v1'],
  ]);
  // x: 2 + 3 buyers, y: 4; b is in the cart, v2 shares v1's group, z is sold out
  expect(getProducts).toHaveBeenCalledWith(db, ['v2', 'x', 'y', 'z']);
  expect(got.map((p) => p.id)).toEqual(['x', 'y']);
});

it('cart: starts from at most three products, an offer as its product, skipping failed lookups', async () => {
  const { db, calls } = cartDb({ base: [{ id: 'q', shoppers: 2 }], c: [{ id: 'r', shoppers: 5 }] }, ['d']);
  getProducts.mockImplementation(async (_db: unknown, ids: string[]) => ids.map((id) => product(id, { stock: 5 })));
  const cart = [product('o1', { offerOf: 'base' }), product('c'), product('d'), product('e')];
  const got = await alsoBoughtWithCart(db, 'US', cart, 8);
  expect(calls.map(([, args]) => (args as { p_product_id: string }).p_product_id)).toEqual(['base', 'c', 'd']);
  expect(got.map((p) => p.id)).toEqual(['r', 'q']);
});

it('cart: empty for an empty cart, without asking', async () => {
  const { db, calls } = cartDb({});
  expect(await alsoBoughtWithCart(db, 'US', [])).toEqual([]);
  expect(calls).toEqual([]);
  expect(getProducts).not.toHaveBeenCalled();
});
