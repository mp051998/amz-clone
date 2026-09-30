'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/supabase/server';
import { readUser } from '@/lib/auth';
import { ensureGuestToken, getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import * as cart from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';

function qtyOf(formData: FormData, fallback = 1): number {
  const n = Number(formData.get('qty'));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** db client, store and (for guests) the cart token — minted on first write. */
async function scope() {
  const [client, market, user] = await Promise.all([db(), getMarket(), readUser()]);
  return { client, market, token: user ? null : await ensureGuestToken() };
}

async function add(formData: FormData, then: '/cart' | '/checkout'): Promise<void> {
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
  redirect(storePath({ id: market }, then));
}

export async function addToCart(formData: FormData): Promise<void> {
  await add(formData, '/cart');
}

export async function buyNow(formData: FormData): Promise<void> {
  await add(formData, '/checkout');
}

/** Most a "Frequently bought together" bundle holds: the product and two more (a "use server" file exports only actions). */
const BUNDLE_MAX = 3;

/**
 * "Add all to cart" for a bought-together bundle: one of each ticked product (`id`, repeated).
 * On to the cart when at least one went in; back to the product page (`from`) with the error
 * when none did. Ids and the page are checked here since a client can send anything.
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
  redirect(storePath({ id: market }, '/cart'));
}

/** set a line's quantity; qty=0 removes it. */
export async function updateQty(formData: FormData): Promise<void> {
  const { client, market, token } = await scope();
  try {
    await cart.setCartQty(client, market, String(formData.get('id') ?? ''), qtyOf(formData, 0), token);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
  }
  revalidatePath('/', 'layout');
}

export async function removeItem(formData: FormData): Promise<void> {
  const { client, market, token } = await scope();
  try {
    await cart.setCartQty(client, market, String(formData.get('id') ?? ''), 0, token);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
  }
  revalidatePath('/', 'layout');
}

export async function clearCart(): Promise<void> {
  const { client, market, token } = await scope();
  await cart.clearCart(client, market, token);
  revalidatePath('/', 'layout');
}
