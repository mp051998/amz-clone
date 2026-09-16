import { amazon } from './amazon';

/** a delivery-date label like "Tue, Sep 19", `days` out in the store timezone. */
export function deliveryDate(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat(amazon.locale.default, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: amazon.dates.timeZone,
  }).format(d);
}
