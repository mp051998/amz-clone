import { cn } from '../lib/cn';

export interface StarsProps {
  rating: number;
  count?: number;
  href?: string;
  size?: 12 | 16 | 18;
  className?: string;
}

/** 5-star rating with a clip-based partial fill; count link beside (design.md §5 Stars). */
export function Stars({ rating, count, href, size = 16, className }: StarsProps) {
  const r = Math.max(0, Math.min(5, rating));
  const label = `${Number.isInteger(r) ? r : r.toFixed(1)} out of 5 stars`;
  const pct = (r / 5) * 100;
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span role="img" aria-label={label} className="relative inline-block leading-none" style={{ width: size * 5, height: size }}>
        <span className="absolute inset-0 flex text-line-2" aria-hidden>{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={size} />)}</span>
        <span className="absolute inset-0 flex overflow-hidden text-star" style={{ width: `${pct}%` }} aria-hidden>{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={size} />)}</span>
      </span>
      {count != null ? (
        href ? <a href={href} className="text-[14px] text-link hover:text-link-hover hover:underline">{count.toLocaleString('en-US')}</a>
             : <span className="text-[12px] text-ink-2">({count.toLocaleString('en-US')})</span>
      ) : null}
    </span>
  );
}

function Star({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0">
      <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.6L12 17.9 6.1 20.6l1.2-6.6L2.5 9.4l6.6-.9z" />
    </svg>
  );
}
