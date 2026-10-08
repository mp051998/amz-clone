import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { getRecall, listRecalls, myRecalls, recallInputError, recallProduct, recallsFor } from './recalls';

type Reply = { data: unknown; error: unknown };

/** A client whose reads answer from a queue of replies per table (and per RPC), recording each call. */
function fakeDb(replies: Record<string, Reply[]>) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const db = {
    from: (table: string) => {
      const call = { table, ops: [] as [string, unknown[]][] };
      calls.push(call);
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'order', 'limit', 'maybeSingle']) {
        q[m] = (...args: unknown[]) => {
          call.ops.push([m, args]);
          return q;
        };
      }
      q.then = (resolve: (r: Reply) => unknown) => resolve(replies[table]?.shift() ?? { data: [], error: null });
      return q;
    },
    rpc: async (fn: string, args: unknown) => {
      calls.push({ table: `rpc:${fn}`, ops: [['args', [args]]] });
      return replies[`rpc:${fn}`]?.shift() ?? { data: null, error: null };
    },
  };
  return { db: db as unknown as Db, calls };
}

const row = (id: string, issued: string) => ({
  product_id: id,
  hazard: 'The handle can overheat.',
  remedy: 'Stop using it and return it for a refund.',
  issued_at: issued,
  updated_at: issued,
  products: { title: `Kettle ${id}`, image: `/img/${id}.jpg`, market_id: 'US' },
});

const recall = (id: string, issued: string) => ({
  productId: id,
  title: `Kettle ${id}`,
  image: `/img/${id}.jpg`,
  hazard: 'The handle can overheat.',
  remedy: 'Stop using it and return it for a refund.',
  issuedAt: issued,
  updatedAt: issued,
});

it('checks a recall’s hazard and remedy', () => {
  expect(recallInputError('The handle can overheat.', 'Stop using it.')).toBeNull();
  expect(recallInputError('  short   ', 'Stop using it.')).toMatchObject({ field: 'hazard' });
  expect(recallInputError('The handle can overheat.', 'x'.repeat(501))).toMatchObject({ field: 'remedy' });
  expect(recallInputError(undefined, undefined)).toMatchObject({ field: 'hazard' });
});

it('lists a store’s recalls, newest first', async () => {
  const { db, calls } = fakeDb({ product_recalls: [{ data: [row('p2', '2026-10-05T00:00:00Z'), row('p1', '2026-10-01T00:00:00Z')], error: null }] });
  expect(await listRecalls(db, 'US')).toEqual([recall('p2', '2026-10-05T00:00:00Z'), recall('p1', '2026-10-01T00:00:00Z')]);
  expect(calls[0].ops).toContainEqual(['eq', ['products.market_id', 'US']]);
  expect(calls[0].ops).toContainEqual(['order', ['issued_at', { ascending: false }]]);
});

it('reads one product’s recall, or none', async () => {
  const { db } = fakeDb({ product_recalls: [{ data: row('p1', '2026-10-01T00:00:00Z'), error: null }, { data: null, error: null }] });
  expect(await getRecall(db, 'p1')).toEqual(recall('p1', '2026-10-01T00:00:00Z'));
  expect(await getRecall(db, 'p9')).toBeNull();
});

it('finds the recalled items among an order’s, without asking when there are none', async () => {
  const { db, calls } = fakeDb({ product_recalls: [{ data: [row('p1', '2026-10-01T00:00:00Z')], error: null }] });
  expect([...(await recallsFor(db, ['p1', 'p2'])).keys()]).toEqual(['p1']);
  expect(calls[0].ops).toContainEqual(['in', ['product_id', ['p1', 'p2']]]);
  expect((await recallsFor(db, [])).size).toBe(0);
  expect(calls).toHaveLength(1);
});

it('matches the shopper’s placed orders to recalls, keeping the latest order for each', async () => {
  const { db, calls } = fakeDb({
    product_recalls: [{ data: [row('p2', '2026-10-05T00:00:00Z'), row('p1', '2026-10-01T00:00:00Z'), row('p3', '2026-09-01T00:00:00Z')], error: null }],
    order_items: [{
      data: [
        { product_id: 'p1', order_id: 'O-OLD', orders: { created_at: '2026-08-01T00:00:00Z' } },
        { product_id: 'p1', order_id: 'O-NEW', orders: { created_at: '2026-09-01T00:00:00Z' } },
        { product_id: 'p3', order_id: 'O-3', orders: { created_at: '2026-07-01T00:00:00Z' } },
      ],
      error: null,
    }],
  });
  expect(await myRecalls(db, 'US', 'u1')).toEqual([
    { ...recall('p1', '2026-10-01T00:00:00Z'), orderId: 'O-NEW', orderedAt: '2026-09-01T00:00:00Z' },
    { ...recall('p3', '2026-09-01T00:00:00Z'), orderId: 'O-3', orderedAt: '2026-07-01T00:00:00Z' },
  ]);
  const items = calls.find((c) => c.table === 'order_items')!;
  expect(items.ops).toContainEqual(['in', ['product_id', ['p2', 'p1', 'p3']]]);
  expect(items.ops).toContainEqual(['eq', ['orders.user_id', 'u1']]);
  expect(items.ops).toContainEqual(['eq', ['orders.status', 'placed']]);
});

it('skips the order lookup when the store has no recalls', async () => {
  const { db, calls } = fakeDb({ product_recalls: [{ data: [], error: null }] });
  expect(await myRecalls(db, 'US', 'u1')).toEqual([]);
  expect(calls.map((c) => c.table)).toEqual(['product_recalls']);
});

it('recalls a product with trimmed text, then reads it back', async () => {
  const { db, calls } = fakeDb({
    'rpc:recall_product': [{ data: { product_id: 'p1', updated: true }, error: null }],
    product_recalls: [{ data: row('p1', '2026-10-01T00:00:00Z'), error: null }],
  });
  expect(await recallProduct(db, 'p1', { hazard: ' The handle can overheat. ', remedy: 'Stop using it and return it for a refund.' })).toEqual({
    recall: recall('p1', '2026-10-01T00:00:00Z'),
    updated: true,
  });
  expect(calls[0].ops).toEqual([['args', [{ p_product: 'p1', p_hazard: 'The handle can overheat.', p_remedy: 'Stop using it and return it for a refund.' }]]]);
});

it('checks a recall before sending it', async () => {
  const { db, calls } = fakeDb({});
  await expect(recallProduct(db, 'p1', { hazard: 'hot', remedy: 'Stop using it.' })).rejects.toMatchObject({ code: 'invalid_input', detail: 'hazard' });
  expect(calls).toEqual([]);
});
