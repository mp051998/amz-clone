import type { CurrencyCode } from '@/lib/contracts';
import { formatMoney, splitMoney } from '@/lib/marketplaces';
import { cn } from '../lib/cn';

export interface PriceProps {
  minor: number;
  currency: CurrencyCode;
  listMinor?: number;
  showSavings?: boolean;
  /** whole-number size in px; symbol/fraction are 13px superscripts (design.md §5 Price). */
  size?: number;
  className?: string;
}

/**
 * Price anatomy from design.md §5 / §13. Whole number is the accessible label carrier so screen
 * readers read one number. `splitMoney`'s `fraction` is the digits only (no decimal point), so the
 * cents superscript renders `.{fraction}` to make the visual concatenation equal `formatMoney`
 * (both en-US and en-IN use `.` as the decimal separator; INR has no fraction so this never shows).
 */
export function Price({ minor, currency, listMinor, showSavings = false, size = 28, className }: PriceProps) {
  const { symbol, whole, fraction } = splitMoney(minor, currency);
  const full = formatMoney(minor, currency);
  const savings = listMinor && listMinor > minor ? Math.round((1 - minor / listMinor) * 100) : 0;
  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      {showSavings && savings > 0 ? <span className="text-[24px] leading-none text-price-deal">-{savings}%</span> : null}
      <span role="text" aria-label={full} className="inline-flex items-start leading-none text-ink">
        <span className="text-[13px] relative top-[2px]">{symbol}</span>
        <span style={{ fontSize: size, lineHeight: 1 }}>{whole}</span>
        {fraction ? <span className="text-[13px] relative top-[2px]">.{fraction}</span> : null}
      </span>
      {listMinor ? <s className="text-[12px] text-ink-2">{formatMoney(listMinor, currency)}</s> : null}
    </span>
  );
}
