import { expect, it, vi } from 'vitest';
import type { Db } from '../db/client';
import { listOffers, OFFERS_MAX } from './offers';

vi.mock('server-only', () => ({}));

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
  title: 'Verity',
  category_slug: 'books',
  image: '/products/p1.jpg',
  price_minor: 949,
  seller: 'Lumen Store',
  ships_from: 'Lumen Store',
  stock: 3,
  offer_of: 'p1',
  condition: 'used_very_good',
  condition_note: 'Clean pages.',
};

it('reads the product’s offers on sale and in stock, cheapest first', async () => {
  const { db, ops } = fakeDb({ data: [row, { ...row, id: 'p1-o1', price_minor: 1650, condition: 'new', condition_note: null }], error: null });
  const offers = await listOffers(db, 'p1');
  expect(ops).toEqual([
    ['from', ['catalog_products_all']],
    ['select', ['*']],
    ['eq', ['offer_of', 'p1']],
    ['is', ['archived_at', null]],
    ['gt', ['stock', 0]],
    ['order', ['price_minor', { ascending: true }]],
    ['order', ['id', { ascending: true }]],
    ['limit', [OFFERS_MAX]],
  ]);
  expect(offers[0]).toMatchObject({ id: 'p1-o2', offerOf: 'p1', condition: 'used_very_good', conditionNote: 'Clean pages.', seller: 'Lumen Store', priceMinor: 949 });
  // a new offer has no condition of its own
  expect(offers[1]).toMatchObject({ id: 'p1-o1', offerOf: 'p1' });
  expect(offers[1]).not.toHaveProperty('condition');
  expect(offers[1]).not.toHaveProperty('conditionNote');
});

it('passes a failed read on', async () => {
  await expect(listOffers(fakeDb({ data: null, error: { message: 'column catalog_products_all.offer_of does not exist', code: '42703' } }).db, 'p1')).rejects.toThrow();
});
