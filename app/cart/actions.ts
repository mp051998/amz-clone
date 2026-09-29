'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase/server';
import { readUser } from '@/lib/auth';
import { ensureGuestToken, getMarket } from '@/lib/session';
import * as cart from '@/lib/data/cart';
import { DataError, messageFor } from '@/lib/data/errors';

export type SwapResult = { ok: true } | { error: string; message?: string };

/**
 * "Swap & save": replace a cart line with a cheaper alternative at the same quantity.
 * The alternative is added first so a failure (out of stock, other store) leaves the cart as it was.
 */
export async function swapCartLine(fromId: string, toId: string): Promise<SwapResult> {
  const [client, market, user] = await Promise.all([db(), getMarket(), readUser()]);
  const token = user ? null : await ensureGuestToken();
  try {
    const current = await cart.getCart(client, market, token);
    const line = current.lines.find((l) => l.product.id === String(fromId));
    if (!line) return { error: 'not_found', message: 'That item is no longer in your cart.' };
    await cart.addToCart(client, market, String(toId), line.qty, token);
    await cart.setCartQty(client, market, line.product.id, 0, token);
  } catch (err) {
    if (err instanceof DataError) return { error: err.code, message: messageFor(err.code) ?? err.message };
    throw err;
  } finally {
    revalidatePath('/', 'layout');
  }
  return { ok: true };
}
