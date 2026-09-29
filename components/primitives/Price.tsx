import type { CurrencyCode } from '@/lib/contracts';
import { formatMoney } from '@/lib/marketplaces';
import { cn } from '../lib/cn';

export interface PriceProps {
  minor: number;
  currency: CurrencyCode;
  /** list / M.R.P. price in the same currency; shown struck through when higher than `minor`. */
  listMinor?: number;
  /** show the green "N% off" when there is a saving (default true). */
  showSavings?: boolean;
  /** optional prefix for the struck price, e.g. "M.R.P." (store.pricing.listLabel). */
  listLabel?: string;
  /** font size of the price in px (default 22). */
  size?: number;
  className?: string;
}

/**
 * Bold whole price, struck list/MRP in ink-3, green "% off" (design.md §5 Price). Store-aware through
 * `currency` (formatMoney: $1,299.00 vs ₹1,29,999). One accessible label carries the full sentence.
 */
export function Price({ minor, currency, listMinor, showSavings = true, listLabel, size = 22, className }: PriceProps) {
  const full = formatMoney(minor, currency);
  const hasList = listMinor != null && listMinor > minor;
  const savings = hasList ? Math.round((1 - minor / listMinor!) * 100) : 0;
  const label = hasList ? `${full}, was ${formatMoney(listMinor!, currency)}${savings > 0 ? `, ${savings}% off` : ''}` : full;
  return (
    <span role="text" aria-label={label} className={cn('inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5', className)}>
      <strong aria-hidden className="font-bold leading-none tracking-[-0.01em] text-ink tabular-nums" style={{ fontSize: size }}>{full}</strong>
      {hasList ? (
        <s aria-hidden className="text-[14px] text-ink-3 tabular-nums">
          {listLabel ? `${listLabel} ` : ''}{formatMoney(listMinor!, currency)}
        </s>
      ) : null}
      {showSavings && savings > 0 ? <span aria-hidden className="text-[13px] font-semibold text-good">{savings}% off</span> : null}
    </span>
  );
}
