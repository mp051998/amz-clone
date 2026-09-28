import { cn } from '../lib/cn';

export interface StarsProps {
  rating: number;
  count?: number;
  href?: string;
  size?: 12 | 14 | 16 | 18 | 20;
  /** show the numeric rating after the stars ("4.4"). */
  showValue?: boolean;
  className?: string;
}

/** ★★★★★ in `star`, partial fill by clipping; optional value + count (design.md §5 Stars). */
export function Stars({ rating, count, href, size = 16, showValue = false, className }: StarsProps) {
  const r = Math.max(0, Math.min(5, rating));
  const value = Number.isInteger(r) ? String(r) : r.toFixed(1);
  const label = `${value} out of 5 stars`;
  const pct = (r / 5) * 100;
  const countText = count != null ? count.toLocaleString('en-US') : null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[14px] text-ink-2', className)}>
      <span role="img" aria-label={label} className="relative inline-block whitespace-nowrap leading-none" style={{ fontSize: size }}>
        <span aria-hidden className="text-line-3">★★★★★</span>
        <span aria-hidden className="absolute inset-0 overflow-hidden text-star" style={{ width: `${pct}%` }}>★★★★★</span>
      </span>
      {showValue ? <strong className="font-semibold text-ink">{value}</strong> : null}
      {countText ? (
        href ? <a href={href} className="text-ink-2 underline underline-offset-2 hover:text-accent-ink">{countText}</a>
             : <span>({countText})</span>
      ) : null}
    </span>
  );
}
