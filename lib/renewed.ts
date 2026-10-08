import type { PublicMarketplace } from './contracts';

/**
 * Renewed: items another seller has inspected, tested and cleaned to work like new, sold for less
 * than new. In a store with the Renewed Guarantee (markets.renewed_return_days: the US store's
 * 90 days) one goes back for a refund or a replacement within that many days of delivery. Pure —
 * unit-testable.
 */

/** Days a renewed item can go back in the store; null without the guarantee. */
export function guaranteeDays(store: Pick<PublicMarketplace, 'returns'>): number | null {
  return store.returns.renewedDays ?? null;
}

/** "90-day Renewed Guarantee"; null in a store without one. */
export function guaranteeLabel(store: Pick<PublicMarketplace, 'returns'>): string | null {
  const days = guaranteeDays(store);
  return days ? `${days}-day Renewed Guarantee` : null;
}

/** What the guarantee promises. */
export function guaranteeText(days: number): string {
  return `If it doesn’t work as it should, return it within ${days} days of delivery for a refund or a replacement.`;
}

/** How much less than new a renewed offer costs, and what percent of the new price that is; null when it isn't cheaper. */
export function savingOnNew(offerMinor: number, newMinor: number): { savedMinor: number; pct: number } | null {
  const savedMinor = newMinor - offerMinor;
  if (savedMinor <= 0 || newMinor <= 0) return null;
  return { savedMinor, pct: Math.round((savedMinor / newMinor) * 100) };
}
