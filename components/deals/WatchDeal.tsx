'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleWatchDeal, type WatchDealResult } from '@/app/actions/deals';
import { cn } from '../lib/cn';
import { storeHref, type MarketId } from '../lib/store';
import { useCompare } from '../decision/Compare';
import { useToast } from '../decision/Toast';

export type WatchDealAction = (dealId: string, watch: boolean) => Promise<WatchDealResult>;

/**
 * "Watch this deal" / "Watching" on an upcoming Lightning Deal, as on Amazon's Today's Deals: when
 * it goes live it's in the shopper's messages. Optimistic; reverts on failure. Signed-out viewers
 * are sent to sign-in and back.
 */
export function WatchDeal({ dealId, watching: initial, name, action = toggleWatchDeal, market, className }: {
  dealId: string;
  /** server-known state (initial) */
  watching: boolean;
  /** product name for the accessible label */
  name?: string;
  action?: WatchDealAction;
  /** market for the sign-in redirect prefix; defaults to the CompareProvider's market */
  market?: MarketId;
  className?: string;
}) {
  const [watching, setWatching] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const compare = useCompare();
  const mkt = market ?? compare.market;

  const onClick = () => {
    const prev = watching;
    setWatching(!prev);
    start(async () => {
      try {
        const res = await action(dealId, !prev);
        if ('error' in res) {
          setWatching(prev);
          if (res.error === 'not_authenticated') {
            const here = `${window.location.pathname}${window.location.search}`;
            router.push(storeHref(mkt, `/signin?next=${encodeURIComponent(here)}`));
            return;
          }
          toast(res.message ?? 'Couldn’t update the deals you’re watching. Try again.');
          return;
        }
        setWatching(res.watching);
        toast(res.watching ? 'Watching. We’ll message you when it’s live.' : 'Stopped watching this deal');
      } catch {
        setWatching(prev);
        toast('Couldn’t update the deals you’re watching. Try again.');
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={watching}
      aria-label={name ? `${watching ? 'Watching deal on' : 'Watch deal on'} ${name}` : undefined}
      className={cn(
        'inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-pill border px-3 text-[14px] font-medium transition-colors disabled:cursor-progress',
        watching ? 'border-ink bg-ink text-on-ink' : 'border-line-3 bg-surface text-ink hover:border-ink',
        className,
      )}
    >
      {watching ? 'Watching' : 'Watch this deal'}
    </button>
  );
}
