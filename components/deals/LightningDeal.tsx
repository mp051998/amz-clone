import { claimedPct } from '@/lib/lightning';
import type { LightningDeal } from '@/lib/types';
import { Countdown } from './Countdown';

const TAG = 'rounded-tag bg-warn-bg px-1.5 py-0.5 text-[12px] font-bold text-warn-strong';

/**
 * A product's Lightning Deal under its price: live ("Lightning Deal · Ends in 2:13:45", and how
 * much of it is claimed once any is), upcoming (its price and when it starts), or sold out.
 * `money` formats store minor units.
 */
export function LightningDealInfo({ deal, money }: { deal: LightningDeal; money: (minor: number) => string }) {
  if (deal.state === 'upcoming') {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
        <span className={TAG}>Upcoming Lightning Deal</span>
        <span>
          <strong className="font-semibold text-ink">{money(deal.dealPriceMinor)}</strong> ·{' '}
          <Countdown to={deal.startsAt} prefix="Starts in " done="Starting in a moment" />
        </span>
      </span>
    );
  }
  if (deal.state === 'sold_out') {
    return (
      <span className="text-[13px] text-ink-2">
        <strong className="font-semibold text-ink">Lightning Deal sold out.</strong> All {deal.quota} at the deal price have been claimed.
      </span>
    );
  }
  const pct = claimedPct(deal);
  return (
    <span className="flex flex-col gap-1.5">
      <span className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className={TAG}>Lightning Deal</span>
        <span className="font-semibold text-warn-strong">
          <Countdown to={deal.endsAt} prefix="Ends in " done="This deal has ended" />
        </span>
      </span>
      {pct > 0 ? (
        <span className="flex items-center gap-2 text-[13px] text-ink-2">
          <span role="progressbar" aria-label="Deal claimed" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="block h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-line-2">
            <span className="block h-full bg-warn-strong" style={{ width: `${pct}%` }} />
          </span>
          <span className="tabular-nums">{pct}% claimed</span>
        </span>
      ) : null}
    </span>
  );
}
