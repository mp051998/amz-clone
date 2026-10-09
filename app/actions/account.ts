'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { changeEmail, changePassword, closeAccount, isRecovery, renameAccount, signOutElsewhere, validEmail } from '@/lib/data/account';
import { DataError } from '@/lib/data/errors';
import { getMarket } from '@/lib/session';
import { storePath } from '@/lib/marketplace';
import { siteOrigin } from '@/lib/origin';
import { owesSecondStep, VERIFY_PATH } from '@/lib/two-step';

const PAGE = '/account/security';

/** One settings form's result: a field error, a form-level error, or a done message. */
export interface AccountFormState {
  field?: string;
  error?: string;
  done?: string;
}

async function signedIn() {
  const user = await readUser();
  if (!user) redirect(storePath({ id: await getMarket() }, `/signin?next=${PAGE}`));
  return user;
}

function failed(err: unknown): AccountFormState {
  if (!(err instanceof DataError)) throw err;
  if (err.status >= 500) {
    console.error('[account]', err.code, err.detail ?? '');
    return { error: 'Something went wrong. Please try again.' };
  }
  return { field: err.detail, error: err.message };
}

export async function updateName(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const user = await signedIn();
  try {
    await renameAccount(createAdminClient(), await db(), user.id, formData.get('name'));
  } catch (err) {
    return failed(err);
  }
  revalidatePath('/', 'layout');
  return { done: 'Name updated.' };
}

export async function updateEmail(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const user = await signedIn();
  try {
    const email = await changeEmail(createAdminClient(), user, {
      email: formData.get('email'),
      currentPassword: formData.get('currentPassword'),
    });
    if (email === user.email) return { done: 'That’s already your email.' };
  } catch (err) {
    return failed(err);
  }
  revalidatePath('/', 'layout');
  return { done: 'Email updated. Use it the next time you sign in.' };
}

export async function updatePassword(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const user = await signedIn();
  const client = await db();
  const newPassword = formData.get('newPassword');
  if (newPassword !== formData.get('confirmPassword')) {
    return { field: 'confirmPassword', error: 'The two passwords don’t match.' };
  }
  let recovering = false;
  let secondStep = false;
  try {
    const [{ data: claims }, { data: session }] = await Promise.all([client.auth.getClaims(), client.auth.getSession()]);
    if (!claims || !session.session) throw new DataError('not_authenticated');
    recovering = isRecovery(claims.claims);
    const fresh = await changePassword(createAdminClient(), user, {
      newPassword,
      currentPassword: formData.get('currentPassword'),
      recovering,
      accessToken: session.session.access_token,
    });
    await client.auth.setSession({ access_token: fresh.access_token, refresh_token: fresh.refresh_token });
    // a password sign-in: with two-step verification on, the new session needs a code too
    secondStep = owesSecondStep(fresh.user, fresh.access_token);
  } catch (err) {
    return failed(err);
  }
  if (secondStep) {
    redirect(`${storePath({ id: await getMarket() }, VERIFY_PATH)}?${new URLSearchParams({ next: `${PAGE}?done=password` })}`);
  }
  // the fresh session isn't a reset session: the page lays out differently, so reload it with a notice
  if (recovering) redirect(`${storePath({ id: await getMarket() }, PAGE)}?done=password`);
  return { done: 'Password changed. You’ve been signed out on your other devices.' };
}

/** "Sign out everywhere": every other session of the account ends; this one carries on. */
export async function signOutEverywhere(_prev: AccountFormState, _formData: FormData): Promise<AccountFormState> {
  await signedIn();
  try {
    const { data } = await (await db()).auth.getSession();
    if (!data.session) throw new DataError('not_authenticated');
    await signOutElsewhere(createAdminClient(), data.session.access_token);
  } catch (err) {
    return failed(err);
  }
  return { done: 'You’re signed out everywhere else. You’re still signed in here.' };
}

/**
 * Close the account for good (the box ticked, the current password given, nothing still open).
 * The session ends with it, and the visitor lands on sign-in with a notice.
 */
export async function closeMyAccount(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const user = await signedIn();
  if (formData.get('confirm') !== 'yes') {
    return { field: 'confirm', error: 'Tick the box to confirm you want to close your account.' };
  }
  const client = await db();
  try {
    await closeAccount(createAdminClient(), client, user, { currentPassword: formData.get('currentPassword') });
  } catch (err) {
    return failed(err);
  }
  // the user is gone; this only clears the session cookies (Auth answers the sign-out with a 404)
  await client.auth.signOut({ scope: 'local' });
  revalidatePath('/', 'layout');
  redirect(`${storePath({ id: await getMarket() }, '/signin')}?closed=1`);
}

/**
 * Email a password-reset link. The answer is the same whether or not an account exists, so
 * the form can't be used to find out who shops here.
 */
export async function requestPasswordReset(formData: FormData): Promise<void> {
  const market = await getMarket();
  const back = (qs: string) => redirect(`${storePath({ id: market }, '/signin/forgot')}?${qs}`);
  let email: string;
  try {
    email = validEmail(formData.get('email'));
  } catch {
    return back('error=email');
  }
  const next = storePath({ id: market }, PAGE);
  const { error } = await (await db()).auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`,
  });
  if (error?.code === 'over_email_send_rate_limit' || error?.status === 429) return back('error=wait');
  if (error) console.error('[account] reset email', error.code, error.message);
  back('sent=1');
}
