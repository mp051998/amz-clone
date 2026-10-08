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
import { verifySecondStep, type AuthSession } from '@/lib/data/two-step';
import { owesSecondStep, readCode, VERIFY_PATH } from '@/lib/two-step';

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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) signinError(market, 'badcreds', next, false);
    // two-step verification on: the password was only the first step (the cart waits for the code)
    if (owesSecondStep(data.user, data.session?.access_token)) redirect(verifyHref(market, next));
  }

  await adoptGuestCart();
  revalidatePath('/', 'layout');
  redirect(inStore(market, next));
}

function verifyHref(market: Market, next: string, error?: string): string {
  const qs = new URLSearchParams({ next });
  if (error) qs.set('error', error);
  return `${storePath({ id: market }, VERIFY_PATH)}?${qs}`;
}

/**
 * The second step of signing in with two-step verification on: the code from the shopper's
 * authenticator app. A right one upgrades the session (aal2), takes over the guest cart and
 * continues to `next`; otherwise back to the code page with `error` (`code`, `expired`, `unavailable`).
 */
export async function verifySignIn(formData: FormData): Promise<void> {
  const next = safeNext(String(formData.get('next') ?? '/'));
  const market = await getMarket();
  const supabase = await db();
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) redirect(`${storePath({ id: market }, '/signin')}?${new URLSearchParams({ next })}`);
  const code = readCode(formData.get('code'));
  if (!code) redirect(verifyHref(market, next, 'code'));

  let session: AuthSession | null = null;
  let failure: string | null = null;
  try {
    session = await verifySecondStep(token, code);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    // two_step_off: turned off elsewhere meanwhile, so there's nothing left to check
    if (err.code !== 'two_step_off') failure = err.code === 'invalid_input' ? 'code' : err.code === 'not_authenticated' ? 'expired' : 'unavailable';
  }
  if (failure) redirect(verifyHref(market, next, failure));
  if (session) {
    const { error } = await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (error) redirect(verifyHref(market, next, 'unavailable'));
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
