/**
 * "Would you like to tell us about a lower price?": what a shopper says about where they saw a
 * product for less, and the checks on it, shared by the product page form and the server
 * (client-safe, no data access). The data side is lib/data/lower-price.ts.
 */

export type LowerPriceWhere = 'online' | 'store';
export type PriceReportStatus = 'open' | 'reviewed';

export interface PriceReport {
  id: string;
  productId: string;
  /** the product's price when it was reported */
  ourPriceMinor: number;
  seenAt: LowerPriceWhere;
  /** online: the page */
  url: string | null;
  /** in a shop: its name, town and the day */
  storeName: string | null;
  city: string | null;
  seenOn: string | null;
  priceMinor: number;
  /** online: what delivery cost (0 in a shop) */
  shippingMinor: number;
  status: PriceReportStatus;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
}

export interface LowerPriceInput {
  seenAt: LowerPriceWhere;
  priceMinor: number;
  shippingMinor: number;
  url: string | null;
  store: string | null;
  city: string | null;
  seenOn: string | null;
}

export type LowerPriceField = 'seen_at' | 'price' | 'shipping' | 'url' | 'store' | 'city' | 'seen_on';

/** How far back a shop price can be from. */
export const LOWER_PRICE_DAYS = 30;
const URL_RE = /^https?:\/\/[^/\s]+\.[^/\s]+(\/\S*)?$/i;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * What a shopper wrote, checked: `{input}` to send, or `{field, message}` for the first thing
 * that's wrong. `ourPriceMinor`, when given, refuses a price (plus delivery) that isn't lower.
 * `today` is the shopper's day (YYYY-MM-DD), for a shop price's date.
 */
export function checkLowerPrice(
  raw: { seenAt?: unknown; priceMinor?: unknown; shippingMinor?: unknown; url?: unknown; store?: unknown; city?: unknown; seenOn?: unknown },
  { ourPriceMinor, today = new Date().toISOString().slice(0, 10) }: { ourPriceMinor?: number; today?: string } = {},
): { input: LowerPriceInput } | { field: LowerPriceField; message: string } {
  if (raw.seenAt !== 'online' && raw.seenAt !== 'store') return { field: 'seen_at', message: 'Choose where you saw it: on a website or in a shop.' };
  const online = raw.seenAt === 'online';
  const price = raw.priceMinor;
  if (typeof price !== 'number' || !Number.isInteger(price) || price < 1) return { field: 'price', message: 'Enter the price you saw.' };
  const shipping = online ? (raw.shippingMinor == null || raw.shippingMinor === '' ? 0 : raw.shippingMinor) : 0;
  if (typeof shipping !== 'number' || !Number.isInteger(shipping) || shipping < 0) return { field: 'shipping', message: 'Enter what delivery cost, or 0 if it was free.' };

  let url: string | null = null;
  let store: string | null = null;
  let city: string | null = null;
  let seenOn: string | null = null;
  if (online) {
    url = text(raw.url);
    if (!URL_RE.test(url) || url.length > 500) return { field: 'url', message: 'Enter the web address of the page, starting with https://.' };
  } else {
    store = text(raw.store);
    if (!store || store.length > 80) return { field: 'store', message: 'Enter the shop’s name (up to 80 characters).' };
    city = text(raw.city) || null;
    if (city && city.length > 60) return { field: 'city', message: 'Keep the town or city under 60 characters.' };
    seenOn = text(raw.seenOn);
    const at = DAY_RE.test(seenOn) ? Date.parse(`${seenOn}T00:00:00Z`) : NaN;
    const now = Date.parse(`${today}T00:00:00Z`);
    // a day ahead of UTC is still today east of it
    if (Number.isNaN(at) || at > now + DAY || at < now - LOWER_PRICE_DAYS * DAY) {
      return { field: 'seen_on', message: `Enter the day you saw it, within the last ${LOWER_PRICE_DAYS} days.` };
    }
  }
  if (ourPriceMinor != null && price + shipping >= ourPriceMinor) {
    return { field: 'price', message: online ? 'That isn’t lower than our price, with delivery.' : 'That isn’t lower than our price.' };
  }
  return { input: { seenAt: raw.seenAt, priceMinor: price, shippingMinor: shipping, url, store, city, seenOn } };
}

/** A price typed into a form ("19.99", "1,299", "₹1,299") in minor units (both stores price in 1/100ths), or null when it isn't one. */
export function priceMinorOf(v: unknown): number | null {
  const clean = text(v).replace(/[,\s$₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** What a report's price comes to, delivery included. */
export const reportTotal = (r: Pick<PriceReport, 'priceMinor' | 'shippingMinor'>) => r.priceMinor + r.shippingMinor;

/** Where an online price was seen, as its site ("example.com"). */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
