'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase/server';
import { readUser } from '@/lib/auth';
import { ensureGuestToken, getMarket } from '@/lib/session';
import * as cart from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';

export type AddInlineResult = { ok: true; count: number } | { ok: false; code: string; message: string };

/**
 * PDP "Add to Cart" without leaving the page (prototype justAdded banner): same data path as
 * app/actions/cart.ts#addToCart, but returns the new cart count instead of redirecting to /cart.
 * With `protection`, the line gets the store's protection plan too; `size` is the one picked, for a
 * product that comes in sizes.
 */
export async function addToCartInline(productId: string, qty = 1, protection = false, size: string | null = null): Promise<AddInlineResult> {
  const [client, market, user] = await Promise.all([db(), getMarket(), readUser()]);
  const token = user ? null : await ensureGuestToken();
  const n = Number.isFinite(qty) ? Math.min(10, Math.max(1, Math.floor(qty))) : 1;
  try {
    let next = await cart.addToCart(client, market, String(productId), n, token, typeof size === 'string' ? size : null);
    if (protection) next = await cart.setCartProtection(client, market, String(productId), true, token);
    revalidatePath('/', 'layout');
    return { ok: true, count: next.count };
  } catch (err) {
    if (err instanceof DataError) {
      // say which size is in the cart already
      const message = err.code === 'size_in_cart' && err.detail ? `Your cart already has this in size ${err.detail}. Change the size in your cart instead.` : err.message;
      return { ok: false, code: err.code, message };
    }
    throw err;
  }
}
