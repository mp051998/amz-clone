import { localDayOf, localDayStart } from './decision/tracking';

type HolidayStore = { returns: { holiday?: boolean }; dates: { timeZone: string } };

/**
 * amazon.com's holiday returns: what's bought from November 1 to December 31 (in the store's time
 * zone) can go back until the end of January 31 after, or within its own window from delivery when
 * that ends later. The deadline for something bought at `at`, or null (out of season, or a store
 * without them). Mirrors the database's `private.holiday_return_by`.
 */
export function holidayReturnBy(store: HolidayStore, at: Date | string): Date | null {
  if (!store.returns.holiday) return null;
  const tz = store.dates.timeZone;
  const [year, month] = localDayOf(new Date(at).toISOString(), tz).split('-').map(Number);
  if (month < 11) return null;
  // the last second of January 31 there
  return new Date(Date.parse(localDayStart(`${year + 1}-02-01`, tz)) - 1000);
}
