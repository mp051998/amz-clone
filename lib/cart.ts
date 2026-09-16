import { cookies } from 'next/headers';
import { getProduct, type Product } from './catalog';
import type { CurrencyCode, PublicMarketplace } from './contracts';
import { toStoreMinor } from './fx';

export const CART_COOKIE = 'amz_cart';
export type CartMap = Record<string, number>;

export interface CartLine {
  product: Product;
  qty: number;
  lineTotalMinor: number;
}

/** parse the cart cookie into an {id: qty} map (safe on malformed input). */
export async function readCart(): Promise<CartMap> {
  const raw = (await cookies()).get(CART_COOKIE)?.value;
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return {};
    const out: CartMap = {};
    for (const [id, qty] of Object.entries(obj)) {
      const n = Number(qty);
      if (getProduct(id) && Number.isFinite(n) && n > 0) out[id] = Math.min(30, Math.floor(n));
    }
    return out;
  } catch {
    return {};
  }
}

/** persist the cart map. Only callable inside a Server Action / Route Handler. */
export async function writeCart(map: CartMap): Promise<void> {
  const jar = await cookies();
  const clean = Object.fromEntries(Object.entries(map).filter(([, q]) => q > 0));
  if (Object.keys(clean).length === 0) {
    jar.delete(CART_COOKIE);
    return;
  }
  jar.set(CART_COOKIE, JSON.stringify(clean), {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function cartCount(): Promise<number> {
  const map = await readCart();
  return Object.values(map).reduce((a, b) => a + b, 0);
}

/** Cart lines priced in `cur` (line unit price converted once, then × qty). */
export async function getCartLines(cur: CurrencyCode = 'USD'): Promise<CartLine[]> {
  const map = await readCart();
  const lines: CartLine[] = [];
  for (const [id, qty] of Object.entries(map)) {
    const product = getProduct(id);
    if (product) lines.push({ product, qty, lineTotalMinor: toStoreMinor(product.priceMinor, cur) * qty });
  }
  return lines;
}

export async function cartSubtotalMinor(cur: CurrencyCode = 'USD'): Promise<number> {
  const lines = await getCartLines(cur);
  return lines.reduce((a, l) => a + l.lineTotalMinor, 0);
}

export interface OrderTotals {
  subtotalMinor: number;
  shipMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/** flat shipping fee below the free threshold, per store currency. */
function shipFeeMinor(store: PublicMarketplace): number {
  return store.currency.code === 'INR' ? 4000 : 599; // ₹40 / $5.99
}

/**
 * Totals in the store's currency. `subtotalMinor` must already be in that currency.
 * Free shipping at/over the store threshold, else a flat fee; tax is added on top
 * for tax-exclusive stores (US 8%) and folded into the price for tax-inclusive ones (IN).
 */
export function computeTotals(subtotalMinor: number, store: PublicMarketplace): OrderTotals {
  const free = subtotalMinor === 0 || subtotalMinor >= store.delivery.freeThresholdMinor;
  const shipMinor = free ? 0 : shipFeeMinor(store);
  const taxMinor = store.pricing.taxInclusive ? 0 : Math.round(subtotalMinor * 0.08);
  return { subtotalMinor, shipMinor, taxMinor, totalMinor: subtotalMinor + shipMinor + taxMinor };
}
