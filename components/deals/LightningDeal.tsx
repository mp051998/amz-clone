import { claimedPct, inEarlyAccess } from '@/lib/lightning';
import type { LightningDeal } from '@/lib/types';
import { Countdown } from './Countdown';

const TAG = 'rounded-tag bg-warn-bg px-1.5 py-0.5 text-[12px] font-bold text-warn-strong';

/** Early access for the store's members: its name, whether the viewer is one, and where to join. */
export interface EarlyAccess {
  membership: string;
  member: boolean;
  joinHref: string;
}

/** How much of a deal is claimed, once any is. */
function Claimed({ deal }: { deal: LightningDeal }) {
  const pct = claimedPct(deal);
  if (pct <= 0) return null;
  return (
    <span className="flex items-center gap-2 text-[13px] text-ink-2">
      <span role="progressbar" aria-label="Deal claimed" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="block h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-line-2">
        <span className="block h-full bg-warn-strong" style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums">{pct}% claimed</span>
    </span>
  );
}

/**
 * A product's Lightning Deal under its price: live ("Lightning Deal · Ends in 2:13:45", and how
 * much of it is claimed once any is), upcoming (its price and when it starts), or sold out.
 * With `early`, an upcoming deal also says members get it half an hour early, and in that half
 * hour, that a member pays its price now (or that members can, with a way to join).
 * `money` formats store minor units.
 */
export function LightningDealInfo({ deal, money, early }: { deal: LightningDeal; money: (minor: number) => string; early?: EarlyAccess }) {
  if (deal.state === 'upcoming') {
    const open = early != null && inEarlyAccess(deal);
    if (open && early.member) {
      return (
        <span className="flex flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
            <span className={TAG}>{early.membership} early access</span>
            <span>
              You pay <strong className="font-semibold text-ink">{money(deal.dealPriceMinor)}</strong> at checkout ·{' '}
              <Countdown to={deal.startsAt} prefix="Opens to everyone in " done="Opening to everyone now" />
            </span>
          </span>
          <Claimed deal={deal} />
        </span>
      );
    }
    return (
      <span className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
          <span className={TAG}>Upcoming Lightning Deal</span>
          <span>
            <strong className="font-semibold text-ink">{money(deal.dealPriceMinor)}</strong> ·{' '}
            <Countdown to={deal.startsAt} prefix="Starts in " done="Starting in a moment" />
          </span>
        </span>
        {early ? (
          <span className="text-[13px] text-ink-2">
            {open ? `${early.membership} members can buy it at this price now.` : `${early.membership} members get it 30 minutes early.`}
            {early.member ? null : (
              <>
                {' '}
                <a href={early.joinHref} className="text-ink underline underline-offset-2">
                  Join {early.membership}
                </a>
              </>
            )}
          </span>
        ) : null}
        <Claimed deal={deal} />
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
  return (
    <span className="flex flex-col gap-1.5">
      <span className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className={TAG}>Lightning Deal</span>
        <span className="font-semibold text-warn-strong">
          <Countdown to={deal.endsAt} prefix="Ends in " done="This deal has ended" />
        </span>
      </span>
      <Claimed deal={deal} />
    </span>
  );
}
