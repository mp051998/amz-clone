import { cookies } from 'next/headers';
import { getProduct, type Product } from './catalog-market';
import type { CurrencyCode, PublicMarketplace } from './contracts';
import { toStoreMinor } from './fx';
import { getMarketplace } from './marketplace-server';

export const CART_COOKIE = 'amz_cart';
export type CartMap = Record<string, number>;

export interface CartLine {
  product: Product;
  qty: number;
  lineTotalMinor: number;
}

/**
 * Cart cookie name for the active store. amazon.com and amazon.in are separate
 * marketplaces (like the real sites), so each keeps its own cart: US -> `amz_cart`,
 * IN -> `amz_cart_in`. The store is read from the request (x-amz-country), so the
 * same code path scopes the cart correctly in server components and server actions.
 */
async function cartCookieName(): Promise<string> {
  const store = await getMarketplace();
  return store.id === 'IN' ? `${CART_COOKIE}_in` : CART_COOKIE;
}

/** parse the active store's cart cookie into an {id: qty} map (safe on malformed input). */
export async function readCart(): Promise<CartMap> {
  const raw = (await cookies()).get(await cartCookieName())?.value;
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

/** persist the active store's cart map. Only callable inside a Server Action / Route Handler. */
export async function writeCart(map: CartMap): Promise<void> {
  const jar = await cookies();
  const name = await cartCookieName();
  const clean = Object.fromEntries(Object.entries(map).filter(([, q]) => q > 0));
  if (Object.keys(clean).length === 0) {
    jar.delete(name);
    return;
  }
  jar.set(name, JSON.stringify(clean), {
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
    if (product) lines.push({ product, qty, lineTotalMinor: toStoreMinor(product.priceMinor, cur, product.curBase) * qty });
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
