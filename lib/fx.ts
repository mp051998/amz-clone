import type { CurrencyCode } from './contracts';

/** Fixed demo FX from the USD base catalog. Not a live rate — deterministic so prices are stable. */
const RATE: Record<CurrencyCode, number> = { USD: 1, INR: 83 };

/**
 * Convert a USD-base minor amount (cents) into the active store's minor units.
 * USD: identity. INR: cents → rupees at RATE, psychological-rounded to end in 9,
 * returned as paise (×100) since `formatMoney`/`splitMoney` divide INR minor by 100.
 */
export function toStoreMinor(usdMinor: number, currency: CurrencyCode): number {
  if (currency === 'USD') return usdMinor;
  const rupees = (usdMinor / 100) * RATE.INR;
  return psychRupees(rupees) * 100;
}

/** Round to an Amazon-India-looking price: small values to the nearest rupee, larger ones to end in 9/99. */
function psychRupees(r: number): number {
  if (r < 100) return Math.max(1, Math.round(r));
  if (r < 2000) return Math.round(r / 10) * 10 - 1;
  return Math.round(r / 100) * 100 - 1;
}
