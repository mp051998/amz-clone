import type { Db } from '../db/client';
import type { Market } from '../types';
import { DataError, unwrap } from './errors';

/**
 * Sales for store admins (/admin/sales, /api/v1/admin/sales), as Amazon's Business Reports show
 * them: over the store's last N days, orders, units and ordered product sales day by day, the
 * best sellers, and what came back. Read with admin_sales (20261115090000_admin_sales.sql).
 */

/** The periods the sales page offers, in days. */
export const SALES_PERIODS = [7, 30, 90] as const;
export type SalesPeriod = (typeof SALES_PERIODS)[number];

export function salesPeriod(v: unknown): SalesPeriod {
  const n = Number(v);
  return (SALES_PERIODS as readonly number[]).includes(n) ? (n as SalesPeriod) : 30;
}

export interface SalesDay {
  /** the store's calendar day, YYYY-MM-DD */
  day: string;
  orders: number;
  units: number;
  salesMinor: number;
}

export interface SalesProduct {
  productId: string;
  title: string;
  image: string;
  orders: number;
  units: number;
  salesMinor: number;
}

export interface SalesReport {
  days: number;
  /** first and last day covered, YYYY-MM-DD in the store's time zone */
  from: string;
  to: string;
  timeZone: string;
  totals: {
    /** placed and not cancelled */
    orders: number;
    units: number;
    /** what the items sold for after coupons, before tax and delivery */
    salesMinor: number;
    /** placed in the period, cancelled since */
    cancelledOrders: number;
    /** returns received in the period, the units in them and what was refunded for them */
    returns: number;
    unitsReturned: number;
    refundedMinor: number;
  };
  byDay: SalesDay[];
  /** up to 10, most units first */
  top: SalesProduct[];
}

/** A store's sales over its last `days` days (1–365). Admins only (`forbidden` otherwise). */
export async function adminSales(db: Db, market: Market, days: number): Promise<SalesReport> {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new DataError('invalid_input', 'days');
  return unwrap(await db.rpc('admin_sales', { p_market: market, p_days: days })) as unknown as SalesReport;
}

/** Average order value in minor units (0 without orders). */
export function averageOrderMinor(r: Pick<SalesReport, 'totals'>): number {
  return r.totals.orders ? Math.round(r.totals.salesMinor / r.totals.orders) : 0;
}
