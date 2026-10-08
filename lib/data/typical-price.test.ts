import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { typicalPrice, typicalToShow } from './typical-price';

const fake = (res: { data?: unknown; error?: { code: string; message: string } | null }) => {
  const calls: unknown[][] = [];
  const db = { rpc: async (...args: unknown[]) => (calls.push(args), { data: res.data ?? null, error: res.error ?? null }) } as unknown as Db;
  return { db, calls };
};

it('asks about the one product', async () => {
  const { db, calls } = fake({ data: 2499 });
  expect(await typicalPrice(db, 'p1')).toBe(2499);
  expect(calls).toEqual([['typical_price', { p_product: 'p1' }]]);
});

it('null with too little history or before the migration; other errors throw', async () => {
  expect(await typicalPrice(fake({ data: null }).db, 'p1')).toBeNull();
  expect(await typicalPrice(fake({ error: { code: 'PGRST202', message: 'not found' } }).db, 'p1')).toBeNull();
  await expect(typicalPrice(fake({ error: { code: 'XX000', message: 'boom' } }).db, 'p1')).rejects.toThrow();
});

it('shows it only above the price, and only without a list price above the price', () => {
  expect(typicalToShow(2499, 1999)).toBe(2499);
  expect(typicalToShow(2499, 1999, null)).toBe(2499);
  expect(typicalToShow(1999, 1999)).toBeNull();
  expect(typicalToShow(1799, 1999)).toBeNull();
  expect(typicalToShow(null, 1999)).toBeNull();
  expect(typicalToShow(2499, 1999, 2999)).toBeNull();
  // a list price at or under the price isn't shown, so the typical price is
  expect(typicalToShow(2499, 1999, 1999)).toBe(2499);
});
