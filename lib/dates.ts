import { amazon } from './amazon';
import type { PublicMarketplace } from './contracts';

/** a delivery-date label like "Tue, Sep 19" (US) or "Tue, 19 Sep" (IN), `days` out in the store timezone. */
export function deliveryDate(days: number, store: Pick<PublicMarketplace, 'locale' | 'dates'> = amazon): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat(store.locale.default, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: store.dates.timeZone,
  }).format(d);
}
