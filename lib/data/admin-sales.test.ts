import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { adminSales, averageOrderMinor, salesPeriod } from './admin-sales';
import { DataError } from './errors';

it('offers 7, 30 and 90 days, 30 by default', () => {
  expect(salesPeriod('7')).toBe(7);
  expect(salesPeriod('90')).toBe(90);
  expect(salesPeriod(undefined)).toBe(30);
  expect(salesPeriod('365')).toBe(30);
  expect(salesPeriod('week')).toBe(30);
});

it('averages sales over orders', () => {
  expect(averageOrderMinor({ totals: { orders: 3, units: 0, salesMinor: 1000, cancelledOrders: 0, returns: 0, unitsReturned: 0, refundedMinor: 0 } })).toBe(333);
  expect(averageOrderMinor({ totals: { orders: 0, units: 0, salesMinor: 0, cancelledOrders: 0, returns: 0, unitsReturned: 0, refundedMinor: 0 } })).toBe(0);
});

it('reads the report for 1 to 365 days', async () => {
  const calls: unknown[] = [];
  const db = { rpc: async (name: string, args: unknown) => (calls.push([name, args]), { data: { days: 7 }, error: null }) } as unknown as Db;
  expect(await adminSales(db, 'IN', 7)).toEqual({ days: 7 });
  expect(calls).toEqual([['admin_sales', { p_market: 'IN', p_days: 7 }]]);
  for (const bad of [0, 366, 1.5, Number.NaN]) await expect(adminSales(db, 'US', bad)).rejects.toBeInstanceOf(DataError);
  expect(calls).toHaveLength(1);
});
