import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { TwoStepSetupForm } from '@/components/account/SecurityForms';
import { confirmTwoStepSetup } from '@/app/actions/two-step';
import { readTwoStepOn, readUser } from '@/lib/auth';
import { DataError } from '@/lib/data/errors';
import { enrollTwoStep, type TwoStepSetup } from '@/lib/data/two-step';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Two-step verification · Store' };

/**
 * /account/security/two-step: turn on two-step verification. Each visit starts a fresh set-up (a
 * new key for the authenticator app, dropping any left unfinished); a right code from the app
 * finishes it.
 */
export default async function TwoStepSetupPage() {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const user = await readUser();
  if (!user) redirect(sp(`/signin?next=${encodeURIComponent('/account/security/two-step')}`));
  if (await readTwoStepOn()) redirect(sp('/account/security'));
  const token = (await (await db()).auth.getSession()).data.session?.access_token;
  if (!token) redirect(sp(`/signin?next=${encodeURIComponent('/account/security/two-step')}`));

  let setup: TwoStepSetup | null = null;
  let problem: string | null = null;
  try {
    setup = await enrollTwoStep(token);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    if (err.code === 'two_step_on') redirect(sp('/account/security'));
    console.error('[two-step] set-up failed', err.code, err.detail ?? '');
    problem = err.code === 'two_step_unavailable' ? err.message : 'Something went wrong. Please try again.';
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-[18px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <nav aria-label="Breadcrumb" className="text-[14px] text-ink-2">
          <a href={sp('/account')} className="text-ink-2 underline underline-offset-2 hover:text-ink">Account</a>
          <span aria-hidden> › </span>
          <a href={sp('/account/security')} className="text-ink-2 underline underline-offset-2 hover:text-ink">Login &amp; security</a>
          <span aria-hidden> › </span>
          <span className="text-ink">Two-step verification</span>
        </nav>
        <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Turn on two-step verification</h1>
        <p className="m-0 text-[15px] leading-[1.55] text-ink-2">
          Signing in will take your password and a code from an authenticator app on your phone, so someone who learns your password still can’t get in.
          Anywhere else you’re signed in will ask for a code too.
        </p>
        {setup ? (
          <TwoStepSetupForm action={confirmTwoStepSetup.bind(null, setup.factorId)} qrCode={setup.qrCode} secret={setup.secret} cancelHref={sp('/account/security')} />
        ) : (
          <>
            <Alert tone="error">{problem}</Alert>
            <a href={sp('/account/security')} className={`${buttonClasses({ variant: 'secondary' })} self-start`}>Back to Login &amp; security</a>
          </>
        )}
      </div>
    </AppShell>
  );
}
