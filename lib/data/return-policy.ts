import type { Db } from '../db/client';
import type { Market, OrderItem } from '../types';
import { DataError, fromPostgrest } from './errors';

/**
 * Return windows by category (20270101090000_category_return_windows.sql), as on Amazon: a
 * category can have its own window in a store, shorter than the store's or none at all (0: not
 * returnable), and can be replacement only (20270103090000_replacement_only.sql: back for a fault
 * only, replaced, refunded only when it can't be). An order line keeps what it was sold with.
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

/** A category's returns in a store. */
export interface ReturnPolicy {
  /** its window, in days (0: not returnable) */
  days: number;
  /** goes back for a fault only and is replaced; refunded only when it can't be */
  replacementOnly: boolean;
}

/** A category's window (as categoryReturnDays) and whether it's replacement only in a store. */
export async function categoryReturnPolicy(db: Db, market: Market, categorySlug: string, storeDays: number): Promise<ReturnPolicy> {
  const { data, error } = await db.from('market_categories').select('return_days, replacement_only').eq('market_id', market).eq('category_slug', categorySlug).maybeSingle();
  // replacement_only isn't there before its migration lands: the window alone, as before
  if (error) return { days: await categoryReturnDays(db, market, categorySlug, storeDays), replacementOnly: false };
  return { days: data?.return_days ?? storeDays, replacementOnly: data?.replacement_only === true };
}

/** "30-day refund", "7-day replacement" when replacement only, or "Not returnable" for 0 days. */
export function returnPolicyText(days: number, replacementOnly = false): string {
  if (days === 0) return 'Not returnable';
  return replacementOnly ? `${days}-day replacement` : `${days}-day refund`;
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

/** `replacementOnly` for an admin to set from the API: true or false, else `invalid_input` (replacement_only). */
export function parseReplacementOnly(raw: unknown): boolean {
  if (typeof raw !== 'boolean') throw new DataError('invalid_input', 'replacement_only', 'replacementOnly must be true or false.');
  return raw;
}

/** Set a category's window in a store (admins): days, 0 for not returnable, null for the store's. */
export async function setCategoryReturnDays(db: Db, market: Market, slug: string, days: number | null): Promise<void> {
  await setCategoryReturnPolicy(db, market, slug, { days });
}

/** Set a category's window and/or whether it's replacement only in a store (admins); new orders follow. */
export async function setCategoryReturnPolicy(db: Db, market: Market, slug: string, change: { days?: number | null; replacementOnly?: boolean }): Promise<void> {
  const row = {
    ...(change.days !== undefined ? { return_days: change.days } : {}),
    ...(change.replacementOnly !== undefined ? { replacement_only: change.replacementOnly } : {}),
  };
  const res = await db.from('market_categories').update(row).eq('market_id', market).eq('category_slug', slug).select('category_slug');
  if (res.error) throw fromPostgrest(res.error);
  // RLS hides the change from non-admins, so "no row" is either not listed here or not allowed
  if (!res.data.length) throw new DataError('category_not_found');
}
