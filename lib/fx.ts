import type { CurrencyCode } from './contracts';

/** Fixed demo FX from the USD base catalog. Not a live rate — deterministic so prices are stable. */
const RATE: Record<CurrencyCode, number> = { USD: 1, INR: 83 };

/**
 * Convert a minor amount from a product's base currency into the active store's
 * minor units. When base === target (the usual case now that each marketplace has
 * its own native-priced catalog) this is identity. The USD→INR path stays for any
 * USD-base product shown in the INR store: cents → rupees at RATE, psychological-
 * rounded to end in 9, returned as paise (×100) since `formatMoney`/`splitMoney`
 * divide INR minor by 100.
 */
export function toStoreMinor(minor: number, currency: CurrencyCode, base: CurrencyCode = 'USD'): number {
  if (base === currency) return minor;
  if (base === 'USD' && currency === 'INR') {
    const rupees = (minor / 100) * RATE.INR;
    return psychRupees(rupees) * 100;
  }
  if (base === 'INR' && currency === 'USD') {
    const rupees = minor / 100;
    return Math.max(1, Math.round((rupees / RATE.INR) * 100));
  }
  return minor;
}

/** Round to an Amazon-India-looking price: small values to the nearest rupee, larger ones to end in 9/99. */
function psychRupees(r: number): number {
  if (r < 100) return Math.max(1, Math.round(r));
  if (r < 2000) return Math.round(r / 10) * 10 - 1;
  return Math.round(r / 100) * 100 - 1;
}
