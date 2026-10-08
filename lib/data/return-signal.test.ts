import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { frequentlyReturned, returnSignal } from './return-signal';

const fake = (res: { data?: unknown; error?: { code: string; message: string } | null }) => {
  const calls: unknown[][] = [];
  const db = { rpc: async (...args: unknown[]) => (calls.push(args), { data: res.data ?? null, error: res.error ?? null }) } as unknown as Db;
  return { db, calls };
};

it('asks about the one product and reads the flag and reason', async () => {
  const { db, calls } = fake({ data: { frequent: true, reason: 'defective' } });
  expect(await frequentlyReturned(db, 'p1')).toEqual({ reason: 'defective' });
  expect(calls).toEqual([['product_return_signal', { p_product: 'p1' }]]);
});

it('null when not frequent; a reason that isn’t about the product is dropped', async () => {
  expect(await frequentlyReturned(fake({ data: { frequent: false, reason: null } }).db, 'p1')).toBeNull();
  expect(await frequentlyReturned(fake({ data: { frequent: true, reason: 'better_price' } }).db, 'p1')).toEqual({ reason: null });
});

it('null before the migration, other errors throw', async () => {
  expect(await frequentlyReturned(fake({ error: { code: 'PGRST202', message: 'not found' } }).db, 'p1')).toBeNull();
  await expect(frequentlyReturned(fake({ error: { code: 'XX000', message: 'boom' } }).db, 'p1')).rejects.toThrow();
});

it('says when customers usually keep it, never alongside frequently returned', async () => {
  expect(await returnSignal(fake({ data: { frequent: false, kept: true, reason: null } }).db, 'p1')).toEqual({ frequent: null, usuallyKept: true, fit: null });
  expect(await returnSignal(fake({ data: { frequent: true, kept: true, reason: 'damaged' } }).db, 'p1')).toEqual({ frequent: { reason: 'damaged' }, usuallyKept: false, fit: null });
  // before this migration the flag isn't there
  expect(await returnSignal(fake({ data: { frequent: false, reason: null } }).db, 'p1')).toEqual({ frequent: null, usuallyKept: false, fit: null });
  expect(await returnSignal(fake({ error: { code: 'PGRST202', message: 'not found' } }).db, 'p1')).toEqual({ frequent: null, usuallyKept: false, fit: null });
});

it('says which way a product’s size returns lean, beside either flag', async () => {
  expect((await returnSignal(fake({ data: { frequent: false, kept: false, reason: null, fit: 'small' } }).db, 'p1')).fit).toBe('small');
  expect(await returnSignal(fake({ data: { frequent: true, kept: false, reason: null, fit: 'large' } }).db, 'p1')).toEqual({ frequent: { reason: null }, usuallyKept: false, fit: 'large' });
  expect((await returnSignal(fake({ data: { frequent: false, kept: false, reason: null, fit: 'tight' } }).db, 'p1')).fit).toBeNull();
  expect((await returnSignal(fake({ data: { frequent: false, kept: false, reason: null, fit: null } }).db, 'p1')).fit).toBeNull();
});
