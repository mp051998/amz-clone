import type { CurrencyCode } from '@/lib/contracts';
import { cn } from '../lib/cn';
import { Badge } from '../primitives/Badge';
import { Button } from '../primitives/Button';
import { Price } from '../primitives/Price';
import { Stars } from '../primitives/Stars';

export interface ProductCardProps {
  productId: string;
  title: string;
  href: string;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  priceMinor: number;
  listMinor?: number;
  currency: CurrencyCode;
  variant?: 'list' | 'grid' | 'rail';
  showSavings?: boolean;
  sponsored?: boolean;
  deal?: boolean;
  inStock?: boolean;
}

/** SRP/rail product card (design.md §4/§5). One component, three layouts via `variant`. */
export function ProductCard(p: ProductCardProps) {
  const { variant = 'grid', inStock = true } = p;
  const row = variant === 'list';
  return (
    <article className={cn('bg-white', variant !== 'rail' && 'rounded-[4px] border border-line-card p-4', row ? 'flex gap-4' : 'flex flex-col')}>
      <a href={p.href} aria-hidden tabIndex={-1} className={cn('block shrink-0 bg-surface-4', row ? 'h-[218px] w-[140px]' : 'mb-3 h-[200px] w-full')}>
        {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-full w-full object-contain" /> : <span className="flex h-full w-full items-center justify-center text-[12px] text-ink-4">image</span>}
      </a>
      <div className="min-w-0 flex-1">
        {p.sponsored ? <p className="mb-0.5 text-[11px] text-ink-2">Sponsored ⓘ</p> : null}
        {p.deal ? <div className="mb-1"><Badge tone="deal">Limited time deal</Badge></div> : null}
        <a href={p.href} className="line-clamp-3 text-[18px] leading-6 text-ink hover:text-link-hover hover:underline">{p.title}</a>
        <div className="mt-1"><Stars rating={p.rating} count={p.reviewCount} href={p.href} size={16} /></div>
        {inStock ? (
          <>
            <div className="mt-1"><Price minor={p.priceMinor} currency={p.currency} listMinor={p.listMinor} showSavings={p.showSavings} size={21} /></div>
            <div className="mt-3"><Button size="sm">Add to cart</Button></div>
          </>
        ) : (
          <p className="mt-2 text-[14px] text-ink-2">Currently unavailable</p>
        )}
      </div>
    </article>
  );
}
