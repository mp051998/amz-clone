'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { nameFromEmail } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { clearGuestToken, getMarket, readGuestToken } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import type { Market } from '@/lib/types';
import { mergeGuestCart } from '@/lib/data/cart';

/** keep `next` a safe in-app path so the redirect can't be pointed off-site. */
function safeNext(next: string): string {
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}

/** `next` is an in-store path; land back in the store the form was posted from. */
function inStore(market: Market, next: string): string {
  if (next === '/in' || next.startsWith('/in/') || next.startsWith('/in?')) return next;
  return storePath({ id: market }, next);
}

/** bounce back to the sign-in form preserving mode + destination + a short error code. */
function signinError(market: Market, code: string, next: string, creating: boolean): never {
  const qs = new URLSearchParams({ error: code, next });
  if (creating) qs.set('new', '1');
  redirect(`${storePath({ id: market }, '/signin')}?${qs.toString()}`);
}

/** Fold the guest cart (all stores) into the account that just signed in. */
async function adoptGuestCart(): Promise<void> {
  const token = await readGuestToken();
  if (!token) return;
  try {
    await mergeGuestCart(await db(), token);
  } catch (err) {
    console.error('[auth] guest cart merge failed', err);
    return; // keep the cookie so a later sign-in can retry
  }
  await clearGuestToken();
}

export async function signIn(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const next = safeNext(String(formData.get('next') ?? '/'));
  const creating = String(formData.get('mode') ?? '') === 'create';
  const market = await getMarket();

  if (!email || !password) signinError(market, 'missing', next, creating);

  const supabase = await db();

  if (creating) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name || nameFromEmail(email) } },
    });
    if (error) {
      const m = error.message.toLowerCase();
      const code = /already|registered/.test(m)
        ? 'exists'
        : /password/.test(m)
          ? 'weakpw'
          : /rate limit|confirm/.test(m)
            ? 'confirm'
            : 'signup';
      signinError(market, code, next, true);
    }
    // Email-confirmation ON → user created but no active session. Tell them to sign in
    // once confirmed rather than silently landing logged-out.
    if (!data.session) signinError(market, 'confirm', next, true);
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) signinError(market, 'badcreds', next, false);
  }

  await adoptGuestCart();
  revalidatePath('/', 'layout');
  redirect(inStore(market, next));
}

export async function signOut(): Promise<void> {
  const market = await getMarket();
  await (await db()).auth.signOut();
  revalidatePath('/', 'layout');
  redirect(storePath({ id: market }, '/'));
}
