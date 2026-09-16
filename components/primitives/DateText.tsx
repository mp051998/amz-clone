import { formatPromiseDate } from '@/lib/marketplaces';
import type { Store } from '../lib/store';

export interface DateTextProps {
  date: Date;
  /** `formatPromiseDate` needs both `dates` (timeZone) and `locale` (default) to order US month-first vs IN day-first. */
  store: Pick<Store, 'dates' | 'locale'>;
  bold?: boolean;
}

/** Store-aware delivery date: US "September 24" vs IN "24 September" (design.md §13). */
export function DateText({ date, store, bold = true }: DateTextProps) {
  const text = formatPromiseDate(date, store);
  return <span className={bold ? 'font-bold text-ink' : 'text-ink'}>{text}</span>;
}
