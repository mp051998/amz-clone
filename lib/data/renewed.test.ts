import { beforeEach, expect, it, vi } from 'vitest';
import type { Db } from '../db/client';
import type { Product } from '../types';
import { listRenewed, RENEWED_MAX } from './renewed';

vi.mock('server-only', () => ({}));

const parents = vi.hoisted(() => ({ asked: [] as string[][], products: [] as unknown[] }));
vi.mock('./catalog', () => ({
  getProducts: async (_db: unknown, ids: string[]) => {
    parents.asked.push(ids);
    return parents.products;
  },
}));

type Reply = { data: unknown; error: unknown };

/** A client whose catalog read answers `reply`, recording the query. */
function fakeDb(reply: Reply) {
  const ops: [string, unknown[]][] = [];
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'gt', 'order', 'limit']) {
    q[m] = (...args: unknown[]) => {
      ops.push([m, args]);
      return q;
    };
  }
  q.then = (resolve: (r: Reply) => unknown) => resolve(reply);
  const db = { from: (table: string) => (ops.push(['from', [table]]), q) };
  return { db: db as unknown as Db, ops };
}

const row = {
  id: 'p1-o2',
  market_id: 'US',
  currency: 'USD',
  title: 'Phone',
  category_slug: 'electronics',
  image: '/products/p1.jpg',
  price_minor: 24_900,
  seller: 'Renew Co',
  ships_from: 'Amazon',
  stock: 3,
  offer_of: 'p1',
  condition: 'renewed',
  condition_note: 'Battery at 90% or more.',
};

beforeEach(() => {
  parents.asked = [];
  parents.products = [{ id: 'p1', priceMinor: 39_900 } as Product, { id: 'p2', priceMinor: 9_900 } as Product];
});

it('reads the store’s renewed offers on sale and in stock, each with its product', async () => {
  const { db, ops } = fakeDb({ data: [row, { ...row, id: 'p1-o3', price_minor: 26_000 }, { ...row, id: 'p2-o1', offer_of: 'p2' }], error: null });
  const items = await listRenewed(db, 'US');
  expect(ops).toEqual([
    ['from', ['catalog_products_all']],
    ['select', ['*']],
    ['eq', ['market_id', 'US']],
    ['eq', ['condition', 'renewed']],
    ['is', ['archived_at', null]],
    ['gt', ['stock', 0]],
    ['order', ['position', { ascending: true }]],
    ['order', ['price_minor', { ascending: true }]],
    ['order', ['id', { ascending: true }]],
    ['limit', [RENEWED_MAX]],
  ]);
  // each product read once
  expect(parents.asked).toEqual([['p1', 'p2']]);
  expect(items.map((x) => [x.offer.id, x.product.id])).toEqual([
    ['p1-o2', 'p1'],
    ['p1-o3', 'p1'],
    ['p2-o1', 'p2'],
  ]);
  expect(items[0].offer).toMatchObject({ offerOf: 'p1', condition: 'renewed', conditionNote: 'Battery at 90% or more.', priceMinor: 24_900 });
});

it('leaves out an offer whose product is off sale', async () => {
  parents.products = [{ id: 'p2', priceMinor: 9_900 } as Product];
  const { db } = fakeDb({ data: [row, { ...row, id: 'p2-o1', offer_of: 'p2' }], error: null });
  expect((await listRenewed(db, 'US')).map((x) => x.offer.id)).toEqual(['p2-o1']);
});

it('reads no products when there are no offers, and passes a failed read on', async () => {
  expect(await listRenewed(fakeDb({ data: [], error: null }).db, 'IN')).toEqual([]);
  expect(parents.asked).toEqual([[]]);
  await expect(listRenewed(fakeDb({ data: null, error: { message: 'boom', code: '42703' } }).db, 'US')).rejects.toThrow();
});
