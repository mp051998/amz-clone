'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { nameFromEmail } from '@/lib/auth';
import { safeNext } from '@/lib/safe-next';
import { createAdminClient } from '@/lib/supabase/admin';
import { createAccount } from '@/lib/data/account';
import { DataError } from '@/lib/data/errors';
import { db } from '@/lib/supabase/server';
import { getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import type { Market } from '@/lib/types';
import { adoptGuestCart } from '@/lib/guest-cart';

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
    try {
      await createAccount(createAdminClient(), { email, password, name: name || nameFromEmail(email) });
    } catch (err) {
      if (!(err instanceof DataError)) throw err;
      const code =
        err.code === 'duplicate' ? 'exists' : err.detail === 'password' || err.detail === 'email' || err.detail === 'name' ? err.detail : 'signup';
      if (code === 'signup') console.error('[auth] sign-up failed', err.code, err.detail ?? '');
      signinError(market, code, next, true);
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) signinError(market, 'signup', next, true);
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
