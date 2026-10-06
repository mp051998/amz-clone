'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/supabase/server';
import { readUser } from '@/lib/auth';
import { ensureGuestToken, getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import * as cart from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { buyNowQuery, readBuyNow } from '@/lib/buy-now';

function qtyOf(formData: FormData, fallback = 1): number {
  const n = Number(formData.get('qty'));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** db client, store and (for guests) the cart token — minted on first write. */
async function scope() {
  const [client, market, user] = await Promise.all([db(), getMarket(), readUser()]);
  return { client, market, token: user ? null : await ensureGuestToken() };
}

export async function addToCart(formData: FormData): Promise<void> {
  const { client, market, token } = await scope();
  const id = String(formData.get('id') ?? '');
  let code: string | null = null;
  try {
    await cart.addToCart(client, market, id, Math.max(1, qtyOf(formData)), token);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  revalidatePath('/', 'layout');
  if (code) redirect(storePath({ id: market }, `/product/${encodeURIComponent(id)}?error=${code}`));
  redirect(storePath({ id: market }, '/cart'));
}

/** Buy Now: checkout for just this product at the picked quantity; the cart is left as it is. */
export async function buyNow(formData: FormData): Promise<void> {
  const market = await getMarket();
  const buy = readBuyNow(formData.get('id'), formData.get('qty'));
  redirect(storePath({ id: market }, buy ? `/checkout?${buyNowQuery(buy)}` : '/cart'));
}

/** Most a "Frequently bought together" bundle holds: the product and two more (a "use server" file exports only actions). */
const BUNDLE_MAX = 3;

/**
 * "Add all to cart" for a bought-together bundle: one of each ticked product (`id`, repeated).
 * On to the cart when at least one went in (saying how many were left out, and why); back to
 * the product page (`from`) with the error when none did. Ids and the page are checked here since a client can send anything.
 */
export async function addBundle(formData: FormData): Promise<void> {
  const { client, market, token } = await scope();
  const ids = [...new Set(formData.getAll('id').filter((v): v is string => typeof v === 'string' && v.length > 0))].slice(0, BUNDLE_MAX);
  const from = String(formData.get('from') ?? '');
  const back = (code: string) =>
    storePath({ id: market }, /^[A-Za-z0-9_-]+$/.test(from) ? `/product/${encodeURIComponent(from)}?error=${code}` : `/cart?error=${code}`);
  if (!ids.length) redirect(back('invalid_input'));
  let added = 0;
  let code: string | null = null;
  for (const id of ids) {
    try {
      await cart.addToCart(client, market, id, 1, token);
      added++;
    } catch (err) {
      if (!(err instanceof DataError)) throw err;
      code ??= err.code;
    }
  }
  revalidatePath('/', 'layout');
  if (!added) redirect(back(code ?? 'internal'));
  // some went in: on to the cart, saying what was left out
  redirect(storePath({ id: market }, code ? `/cart?skipped=${ids.length - added}&error=${code}` : '/cart'));
}

/** Set a cart line's quantity (0 removes it); when that fails, back to the cart saying why. */
async function setQty(formData: FormData, qty: number): Promise<void> {
  const { client, market, token } = await scope();
  let code: string | null = null;
  try {
    await cart.setCartQty(client, market, String(formData.get('id') ?? ''), qty, token);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  revalidatePath('/', 'layout');
  if (code) redirect(storePath({ id: market }, `/cart?error=${code}`));
}

/** set a line's quantity; qty=0 removes it. */
export async function updateQty(formData: FormData): Promise<void> {
  await setQty(formData, qtyOf(formData, 0));
}

export async function removeItem(formData: FormData): Promise<void> {
  await setQty(formData, 0);
}

export async function clearCart(): Promise<void> {
  const { client, market, token } = await scope();
  await cart.clearCart(client, market, token);
  revalidatePath('/', 'layout');
}
