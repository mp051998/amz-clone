/**
 * Delivery Day (Amazon Day): a Plus member's day of the week for deliveries, as an ISO weekday
 * (1 = Monday … 7 = Sunday). Checkout offers it in stores with `features.deliveryDay`; the
 * database schedules such an order onto the first of those days no sooner than standard delivery.
 */
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export function isWeekday(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 7;
}

/** 5 → "Friday" ("" for anything else). */
export function weekdayName(day: number): string {
  return isWeekday(day) ? WEEKDAYS[day - 1] : '';
}
