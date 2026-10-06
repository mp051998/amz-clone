import type { Db } from '../db/client';
import type { Cart, Market } from '../types';
import { unwrap } from './errors';
import { toCart } from './map';

/**
 * Carts live in the database. A signed-in caller always gets their own cart
 * (resolved from the JWT inside the RPC); a guest is addressed by an unguessable
 * token the caller keeps (httpOnly cookie for the web app, X-Cart-Token header
 * for API clients). All pricing comes back computed by the database.
 */

export async function getCart(db: Db, market: Market, guestToken?: string | null): Promise<Cart> {
  return toCart(unwrap(await db.rpc('cart_get', { p_market: market, p_guest_token: guestToken ?? undefined })));
}

/** Buy Now's checkout summary: just this product at `qty` (1..the store's line limit), priced like a cart of it. */
export async function buyNowQuote(db: Db, market: Market, productId: string, qty: number): Promise<Cart> {
  return toCart(unwrap(await db.rpc('buy_now_quote', { p_market: market, p_product: productId, p_qty: qty })));
}

/** Increment a line (creates the cart on first add). Capped at stock and the per-line max. */
export async function addToCart(db: Db, market: Market, productId: string, qty: number, guestToken?: string | null): Promise<Cart> {
  return toCart(
    unwrap(
      await db.rpc('cart_set_qty', {
        p_market: market,
        p_product_id: productId,
        p_qty: qty,
        p_mode: 'add',
        p_guest_token: guestToken ?? undefined,
      }),
    ),
  );
}

/** Set a line's quantity; 0 removes it. */
export async function setCartQty(db: Db, market: Market, productId: string, qty: number, guestToken?: string | null): Promise<Cart> {
  return toCart(
    unwrap(
      await db.rpc('cart_set_qty', {
        p_market: market,
        p_product_id: productId,
        p_qty: qty,
        p_mode: 'set',
        p_guest_token: guestToken ?? undefined,
      }),
    ),
  );
}

/** Tick or untick a line for checkout, or every line when `productId` is null. */
export async function selectCartLines(db: Db, market: Market, productId: string | null, selected: boolean, guestToken?: string | null): Promise<Cart> {
  return toCart(
    unwrap(
      await db.rpc('cart_select', {
        p_market: market,
        p_selected: selected,
        p_product_id: productId ?? undefined,
        p_guest_token: guestToken ?? undefined,
      }),
    ),
  );
}

export async function clearCart(db: Db, market: Market, guestToken?: string | null): Promise<Cart> {
  return toCart(unwrap(await db.rpc('cart_clear', { p_market: market, p_guest_token: guestToken ?? undefined })));
}

/** After sign-in: fold the guest's carts (every store) into the account. Returns lines merged. */
export async function mergeGuestCart(db: Db, guestToken: string): Promise<number> {
  return unwrap(await db.rpc('cart_merge_guest', { p_guest_token: guestToken }));
}
