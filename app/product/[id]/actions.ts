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
 */
export async function addToCartInline(productId: string, qty = 1): Promise<AddInlineResult> {
  const [client, market, user] = await Promise.all([db(), getMarket(), readUser()]);
  const token = user ? null : await ensureGuestToken();
  const n = Number.isFinite(qty) ? Math.min(10, Math.max(1, Math.floor(qty))) : 1;
  try {
    const next = await cart.addToCart(client, market, String(productId), n, token);
    revalidatePath('/', 'layout');
    return { ok: true, count: next.count };
  } catch (err) {
    if (err instanceof DataError) return { ok: false, code: err.code, message: err.message };
    throw err;
  }
}
