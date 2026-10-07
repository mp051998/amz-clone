import type { Db } from '../db/client';
import type { BuyNow } from '../buy-now';
import type { Cart, Market } from '../types';
import { unwrap } from './errors';
import { toCart } from './map';

/** A checkout priced with a promotion code, or priced without it and why it didn't apply. */
export interface CheckoutQuote {
  cart: Cart;
  promoError?: { code: string; detail?: string };
}

/**
 * The caller's checkout (their cart's ticked lines, or Buy Now's product) priced with `code`
 * (checkout_quote RPC). A code that doesn't apply leaves the cart as it would be without it.
 */
export async function checkoutQuote(db: Db, market: Market, code: string, buyNow?: BuyNow): Promise<CheckoutQuote> {
  const json = unwrap(
    await db.rpc('checkout_quote', {
      p_market: market,
      p_promo_code: code,
      ...(buyNow ? { p_buy: { product_id: buyNow.productId, qty: buyNow.qty, ...(buyNow.protection ? { protection: true } : {}), ...(buyNow.size ? { size: buyNow.size } : {}) } } : {}),
    }),
  ) as { cart: unknown; promo_error: string | null; promo_error_detail: string | null };
  return {
    cart: toCart(json.cart),
    ...(json.promo_error ? { promoError: { code: json.promo_error, ...(json.promo_error_detail ? { detail: json.promo_error_detail } : {}) } } : {}),
  };
}

/** A promotion the store is running. */
export interface PromoOffer {
  code: string;
  percentOff: number;
  description: string;
  /** the category it's for (absent for the whole store) */
  category?: { slug: string; name: string };
  minSpendMinor: number;
  endsAt?: string;
}

/** The store's running promotions, biggest first (none before the promo codes migration). */
export async function activePromoCodes(db: Db, market: Market): Promise<PromoOffer[]> {
  const { data, error } = await db.rpc('active_promo_codes', { p_market: market });
  if (error) return [];
  return (data ?? []).map((r) => ({
    code: r.code,
    percentOff: r.percent_off,
    description: r.description,
    ...(r.category_slug ? { category: { slug: r.category_slug, name: r.category_name ?? r.category_slug } } : {}),
    minSpendMinor: r.min_spend_minor,
    ...(r.ends_at ? { endsAt: r.ends_at } : {}),
  }));
}
