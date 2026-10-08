import type { Db } from '../db/client';
import type { Market, OrderItem } from '../types';
import { DataError, fromPostgrest } from './errors';

/**
 * Return windows by category (20270101090000_category_return_windows.sql), as on Amazon: a
 * category can have its own window in a store, shorter than the store's or none at all (0: not
 * returnable). An order line keeps the window it was sold with.
 */

/** The longest window a category can have, in days. */
export const RETURN_DAYS_MAX = 365;

/** A category's window in a store: its own, or the store's (`storeDays`) when it has none. */
export async function categoryReturnDays(db: Db, market: Market, categorySlug: string, storeDays: number): Promise<number> {
  const { data, error } = await db.from('market_categories').select('return_days').eq('market_id', market).eq('category_slug', categorySlug).maybeSingle();
  // the column isn't there before the migration lands: the store's window, as before
  if (error || data?.return_days == null) return storeDays;
  return data.return_days;
}

/** "30-day refund", or "Not returnable" for a window of 0 days. */
export function returnPolicyText(days: number): string {
  return days === 0 ? 'Not returnable' : `${days}-day refund`;
}

/** Whether an order line can be returned at all (only a category window of 0 says no). */
export function isReturnable(item: Pick<OrderItem, 'returnDays'>): boolean {
  return item.returnDays !== 0;
}

/**
 * A window for an admin to set from a form field: a whole number of days up to RETURN_DAYS_MAX,
 * or null (blank) for the store's own. `invalid_input` (return_days) otherwise.
 */
export function parseReturnDays(raw: unknown): number | null {
  const s = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : raw == null ? '' : null;
  if (s === '') return null;
  const n = s == null ? NaN : Number(s);
  if (!Number.isInteger(n) || n < 0 || n > RETURN_DAYS_MAX) {
    throw new DataError('invalid_input', 'return_days', `Enter a whole number of days from 0 to ${RETURN_DAYS_MAX}, or leave it blank for the store’s window.`);
  }
  return n;
}

/** Set a category's window in a store (admins): days, 0 for not returnable, null for the store's. */
export async function setCategoryReturnDays(db: Db, market: Market, slug: string, days: number | null): Promise<void> {
  const res = await db.from('market_categories').update({ return_days: days }).eq('market_id', market).eq('category_slug', slug).select('category_slug');
  if (res.error) throw fromPostgrest(res.error);
  // RLS hides the change from non-admins, so "no row" is either not listed here or not allowed
  if (!res.data.length) throw new DataError('category_not_found');
}
