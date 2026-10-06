import type { Market } from './types';

/**
 * Where the shopper wants things delivered, for the header's "Deliver to" and the product page's
 * delivery line. Kept per store in a cookie (`deliver:US`, `deliver:IN`) as `postcode|city`, so it
 * works signed out; signed-in shoppers without one see their default address.
 */
export interface DeliverTo {
  postcode: string;
  city?: string;
}

export const deliverCookie = (market: Market) => `deliver:${market}`;
export const DELIVER_MAX_AGE = 60 * 60 * 24 * 365;

/** Before a shopper picks anywhere: India's delivery estimates assume central Bengaluru. */
export const DEFAULT_DELIVER_TO: Record<Market, DeliverTo | null> = {
  US: null,
  IN: { postcode: '560001', city: 'Bengaluru' },
};

const POSTCODE: Record<Market, RegExp> = { US: /^\d{5}$/, IN: /^[1-9]\d{5}$/ };
const CITY = /^\p{L}[\p{L}\p{M} .'-]{0,39}$/u;

export const POSTCODE_ERROR: Record<Market, string> = {
  US: 'Enter a 5-digit ZIP Code.',
  IN: 'Enter a 6-digit Pincode.',
};

/** A store's postcode from what was typed: digits only ("94103-1234" → "94103"), or null. */
export function normalizePostcode(market: Market, raw: string): string | null {
  let v = raw.trim().replace(/\s+/g, '');
  if (market === 'US') v = v.replace(/^(\d{5})-\d{4}$/, '$1');
  return POSTCODE[market].test(v) ? v : null;
}

/** A city worth showing, or undefined (it's display only, but it comes from the browser). */
export function cleanCity(raw: string | null | undefined): string | undefined {
  const v = (raw ?? '').trim().replace(/\s+/g, ' ');
  return CITY.test(v) ? v : undefined;
}

export function serializeDeliverTo(d: DeliverTo): string {
  return d.city ? `${d.postcode}|${d.city}` : d.postcode;
}

export function parseDeliverTo(market: Market, raw: string | null | undefined): DeliverTo | null {
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  const [code, city] = value.split('|');
  const postcode = normalizePostcode(market, code ?? '');
  if (!postcode) return null;
  const c = cleanCity(city);
  return c ? { postcode, city: c } : { postcode };
}

/** "Bengaluru 560001", or just the postcode. */
export function deliverLabel(d: DeliverTo): string {
  return d.city ? `${d.city} ${d.postcode}` : d.postcode;
}
