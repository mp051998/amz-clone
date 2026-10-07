import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { toProduct } from './map';
import { purchaseAllowance } from './purchase-limits';

function fakeDb(data: unknown, error: unknown = null) {
  const calls: [string, object][] = [];
  const db = { rpc: async (fn: string, args: object) => (calls.push([fn, args]), { data, error }) } as unknown as Db;
  return { db, calls };
}

it('asks once per product and says what’s left of each limit', async () => {
  const { db, calls } = fakeDb([
    { product_id: 'a', max_per_customer: 3, bought: 1 },
    { product_id: 'b', max_per_customer: 2, bought: 5 },
  ]);
  const got = await purchaseAllowance(db, 'US', ['a', 'b', 'a']);
  expect(calls).toEqual([['purchase_allowance', { p_market: 'US', p_product_ids: ['a', 'b'] }]]);
  expect(got.get('a')).toEqual({ limit: 3, bought: 1, left: 2 });
  // bought more before the limit was set: nothing left, never below 0
  expect(got.get('b')).toEqual({ limit: 2, bought: 5, left: 0 });
});

it('asks nothing without products, and has none on an error', async () => {
  const none = fakeDb([]);
  expect((await purchaseAllowance(none.db, 'US', [])).size).toBe(0);
  expect(none.calls).toHaveLength(0);
  expect((await purchaseAllowance(fakeDb(null, { message: 'function does not exist' }).db, 'IN', ['x'])).size).toBe(0);
});

it('reads a product’s limit off the catalog', () => {
  expect(toProduct({ id: 'a', max_per_customer: 3 }).maxPerCustomer).toBe(3);
  expect(toProduct({ id: 'a', max_per_customer: null }).maxPerCustomer).toBeUndefined();
});
