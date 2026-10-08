import type { LightningDeal } from './types';

/**
 * Lightning Deals arithmetic and wording. Their timers and "% claimed" are real (the deal's own
 * end and units), the only urgency the store shows (design.md §2.5, §12). Pure.
 */

/** Share of the deal's units ordered, 0–100, rounded down: "47% claimed". */
export function claimedPct(d: Pick<LightningDeal, 'claimed' | 'quota'>): number {
  return Math.min(100, Math.floor((d.claimed * 100) / d.quota));
}

/** Time left as h:mm:ss ("2:13:45", "0:04:09"); "0:00:00" once it has passed. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const two = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
}

/** How far below `priceMinor` the deal price is, as a whole percent. */
export function dealOffPct(priceMinor: number, dealPriceMinor: number): number {
  return priceMinor > dealPriceMinor ? Math.round(((priceMinor - dealPriceMinor) / priceMinor) * 100) : 0;
}

/** How long before its start a deal opens to Plus members at its price (private.lightning_early_access()). */
export const EARLY_ACCESS_MS = 30 * 60_000;

/** When members' early access to a deal starting at `startsAt` opens. */
export function earlyAccessAt(startsAt: string): string {
  return new Date(Date.parse(startsAt) - EARLY_ACCESS_MS).toISOString();
}

/**
 * Whether members can buy a deal at its price now, before it starts: upcoming, with units left, in
 * the half hour before its start (as private.early_lightning_deal).
 */
export function inEarlyAccess(d: Pick<LightningDeal, 'state' | 'startsAt' | 'endsAt' | 'claimed' | 'quota'>, now: number = Date.now()): boolean {
  return d.state === 'upcoming' && d.claimed < d.quota && now >= Date.parse(d.startsAt) - EARLY_ACCESS_MS && now < Date.parse(d.endsAt);
}

const RANK: Record<LightningDeal['state'], number> = { live: 0, sold_out: 1, upcoming: 2 };

/** The one deal to show for a product: live, else sold out (until its end), else the next to start. */
export function pickDeal(deals: LightningDeal[]): LightningDeal | undefined {
  return [...deals].sort((a, b) => RANK[a.state] - RANK[b.state] || a.startsAt.localeCompare(b.startsAt))[0];
}
