import { expect, it, vi } from 'vitest';
import type { Db } from '../db/client';
import { lastPurchase } from './buy-again';

vi.mock('server-only', () => ({}));

type Reply = { data: unknown; error: unknown };

/** A client whose `orders` read answers `reply`, recording the query. */
function fakeDb(reply: Reply) {
  const ops: [string, unknown[]][] = [];
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) {
    q[m] = (...args: unknown[]) => {
      ops.push([m, args]);
      return q;
    };
  }
  q.then = (resolve: (r: Reply) => unknown) => resolve(reply);
  const db = { from: (table: string) => (ops.push(['from', [table]]), q) };
  return { db: db as unknown as Db, ops };
}

it('reads the caller’s latest placed order with the product still on it', async () => {
  const { db, ops } = fakeDb({ data: [{ id: '114-2', created_at: '2026-09-03T17:59:00Z', placed_at: '2026-09-03T18:00:00Z' }], error: null });
  expect(await lastPurchase(db, 'u1', 'p1')).toEqual({ orderId: '114-2', at: '2026-09-03T18:00:00Z' });
  expect(ops).toEqual([
    ['from', ['orders']],
    ['select', ['id, created_at, placed_at, order_items!inner(product_id)']],
    ['eq', ['user_id', 'u1']],
    ['eq', ['status', 'placed']],
    ['in', ['order_items.product_id', ['p1']]],
    ['order', ['created_at', { ascending: false }]],
    ['limit', [1]],
  ]);
});

it('falls back to when the order was made, and is null when it was never bought', async () => {
  expect(await lastPurchase(fakeDb({ data: [{ id: '114-3', created_at: '2026-09-01T10:00:00Z', placed_at: null }], error: null }).db, 'u1', 'p1')).toEqual({
    orderId: '114-3',
    at: '2026-09-01T10:00:00Z',
  });
  expect(await lastPurchase(fakeDb({ data: [], error: null }).db, 'u1', 'p1')).toBeNull();
});

it('counts the product bought from another seller (one of its offers)', async () => {
  const { db, ops } = fakeDb({ data: [], error: null });
  await lastPurchase(db, 'u1', ['p1', 'p1-o1']);
  expect(ops).toContainEqual(['in', ['order_items.product_id', ['p1', 'p1-o1']]]);
});
