'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase/server';
import { readUser } from '@/lib/auth';
import { ensureGuestToken, getMarket } from '@/lib/session';
import * as cart from '@/lib/data/cart';
import { DataError, messageFor } from '@/lib/data/errors';

export type QuietAddResult = { ok: true; count: number } | { error: string; message?: string };

/**
 * Add one unit to the cart without leaving the page (Collections "Add to cart" toasts instead of
 * redirecting like app/actions/cart.addToCart). Guests get the guest cart, same as the cart actions.
 */
export async function addToCartQuiet(productId: string): Promise<QuietAddResult> {
  const [client, market, user] = await Promise.all([db(), getMarket(), readUser()]);
  try {
    const next = await cart.addToCart(client, market, String(productId), 1, user ? null : await ensureGuestToken());
    revalidatePath('/', 'layout');
    return { ok: true, count: next.count };
  } catch (err) {
    if (err instanceof DataError) return { error: err.code, message: messageFor(err.code) ?? err.message };
    throw err;
  }
}
