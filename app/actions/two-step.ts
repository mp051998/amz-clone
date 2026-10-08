'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { checkPassword } from '@/lib/data/account';
import { DataError } from '@/lib/data/errors';
import { confirmTwoStep, turnOffTwoStep } from '@/lib/data/two-step';
import { storePath } from '@/lib/marketplace';
import { getMarket } from '@/lib/session';
import { db } from '@/lib/supabase/server';
import { readCode } from '@/lib/two-step';
import type { AccountFormState } from './account';

const PAGE = '/account/security';

/** The signed-in shopper and their access token (to the sign-in page when there's none). */
async function session(next: string): Promise<{ user: { id: string; email: string }; token: string; client: Awaited<ReturnType<typeof db>> }> {
  const market = await getMarket();
  const user = await readUser();
  const client = await db();
  const token = user ? (await client.auth.getSession()).data.session?.access_token : null;
  if (!user || !token) redirect(storePath({ id: market }, `/signin?next=${encodeURIComponent(next)}`));
  return { user, token, client };
}

function failed(err: unknown): AccountFormState {
  if (!(err instanceof DataError)) throw err;
  if (err.status >= 500) {
    console.error('[two-step]', err.code, err.detail ?? '');
    return { error: err.code === 'two_step_unavailable' ? err.message : 'Something went wrong. Please try again.' };
  }
  return { field: err.detail, error: err.message };
}

/**
 * Finish turning on two-step verification (bound to the factor being set up): the code the
 * authenticator app shows. The session it returns has passed the second step; back to Login &
 * security with a notice.
 */
export async function confirmTwoStepSetup(factorId: string, _prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { token, client } = await session(`${PAGE}/two-step`);
  const code = readCode(formData.get('code'));
  if (!code) return { field: 'code', error: 'Enter the 6-digit code your authenticator app shows.' };
  try {
    const fresh = await confirmTwoStep(token, String(factorId), code);
    const { error } = await client.auth.setSession({ access_token: fresh.access_token, refresh_token: fresh.refresh_token });
    if (error) throw new DataError('internal', error.message);
  } catch (err) {
    return failed(err);
  }
  revalidatePath('/', 'layout');
  redirect(`${storePath({ id: await getMarket() }, PAGE)}?done=two_step_on`);
}

/** Turn two-step verification off, with the current password. */
export async function turnOffTwoStepSetting(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { user, token } = await session(PAGE);
  try {
    if (!(await checkPassword(user.email, formData.get('currentPassword')))) {
      throw new DataError('invalid_input', 'currentPassword', 'That isn’t your current password.');
    }
    await turnOffTwoStep(token);
  } catch (err) {
    return failed(err);
  }
  revalidatePath('/', 'layout');
  redirect(`${storePath({ id: await getMarket() }, PAGE)}?done=two_step_off`);
}
