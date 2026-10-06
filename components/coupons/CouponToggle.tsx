'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setCouponClipped } from '@/app/actions/coupons';
import { useToast } from '../decision/Toast';
import { storeHref, type MarketId } from '../lib/store';
import { cn } from '../lib/cn';

export interface CouponToggleProps {
  productId: string;
  percentOff: number;
  clipped: boolean;
  signedIn: boolean;
  market: MarketId;
  /** formatted saving per unit, e.g. "$4.50" */
  savingText?: string;
  /** where to come back to after signing in (store-relative path) */
  next: string;
  /** compact: one line for cart rows */
  compact?: boolean;
}

/** "Coupon: ☐ Apply 15% coupon": applies the product's coupon to the cart and checkout. */
export function CouponToggle({ productId, percentOff, clipped, signedIn, market, savingText, next, compact = false }: CouponToggleProps) {
  const [on, setOn] = useState(clipped);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const id = `coupon-${productId}${compact ? '-c' : ''}`;

  const onChange = (want: boolean) => {
    if (!signedIn) {
      router.push(storeHref(market, `/signin?next=${encodeURIComponent(next)}`));
      return;
    }
    setOn(want);
    start(async () => {
      try {
        const res = await setCouponClipped(productId, want);
        if ('error' in res) {
          setOn(!want);
          if (res.error === 'not_authenticated') return router.push(storeHref(market, `/signin?next=${encodeURIComponent(next)}`));
          toast(res.message ?? 'Couldn’t change the coupon — try again');
          return;
        }
        router.refresh();
      } catch {
        setOn(!want);
        toast('Couldn’t change the coupon — try again');
      }
    });
  };

  const label = on ? `${percentOff}% coupon applied` : `Apply ${percentOff}% coupon`;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]', compact && 'text-[13px]')}>
      <span className="rounded-tag bg-good-bg px-1.5 py-0.5 text-[12px] font-bold text-good-strong">Coupon</span>
      <label htmlFor={id} className={cn('inline-flex min-h-11 cursor-pointer items-center gap-2 text-ink sm:min-h-0', pending && 'cursor-progress')}>
        <input
          id={id}
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => onChange(e.target.checked)}
          className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-ink"
        />
        <span className={on ? 'font-semibold text-good-strong' : undefined}>{label}</span>
      </label>
      {savingText ? (
        <span className="text-ink-3">{on ? `Saving ${savingText} each at checkout` : `Save ${savingText} each`}</span>
      ) : null}
      {!signedIn && !compact ? <span className="text-ink-3">Sign in to apply</span> : null}
    </div>
  );
}
