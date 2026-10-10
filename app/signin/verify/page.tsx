import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard, AuthFrame } from '@/components/chrome/AuthFrame';
import { Alert } from '@/components/primitives/Alert';
import { Input } from '@/components/primitives/Input';
import { signOut, verifySignIn } from '@/app/actions/auth';
import { readSecondStep, readUser } from '@/lib/auth';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { safeNext } from '@/lib/safe-next';
import { SubmitButton } from '@/components/primitives/SubmitButton';

export const metadata: Metadata = { title: 'Two-step verification · Store' };

const ERRORS: Record<string, string> = {
  code: 'That code didn’t work. Enter the 6-digit code your authenticator app shows now.',
  unavailable: 'We couldn’t check your code just now. Try again.',
};

/**
 * /signin/verify: the second step of signing in with two-step verification on. The proxy keeps a
 * session that has only passed its password here until the code from the authenticator app
 * upgrades it.
 */
export default async function VerifySignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext ?? '/');
  const store = await getMarketplace();
  const inStore = next === '/in' || next.startsWith('/in/') || next.startsWith('/in?') ? next : storePath(store, next);
  if (await readUser()) redirect(inStore);
  const pending = await readSecondStep();
  // no session, or it ran out: start again
  if (!pending) redirect(`${storePath(store, '/signin')}?${new URLSearchParams({ next, ...(error === 'expired' ? { error: 'expired' } : {}) })}`);

  return (
    <AuthFrame homeHref={storePath(store, '/')}>
      <AuthCard title="Two-step verification" lead={<>Enter the code from your authenticator app to sign in as <strong className="font-semibold text-ink">{pending.email}</strong>.</>}>
        {error && ERRORS[error] ? <Alert tone="error">{ERRORS[error]}</Alert> : null}
        <form action={verifySignIn} className="flex flex-col gap-3.5">
          <input type="hidden" name="next" value={next} />
          <Input
            name="code"
            label="6-digit code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 -]{6,8}"
            maxLength={8}
            autoFocus
            hint="It changes every 30 seconds."
            className="font-mono text-[18px] tracking-[0.2em]"
          />
          <SubmitButton variant="primary" size="lg" block className="mt-1" pendingLabel="Signing in…">Sign in</SubmitButton>
        </form>
        <p className="m-0 text-[13px] leading-[1.45] text-ink-3">
          Open the authenticator app you set up (like Google Authenticator, Microsoft Authenticator or 1Password) and find this store’s entry.
        </p>
      </AuthCard>
      <form action={signOut}>
        <SubmitButton bare className="w-full cursor-pointer border-0 bg-transparent p-0 text-center text-[14px] text-ink underline underline-offset-2 hover:text-accent-ink">
          Not you? Sign out
        </SubmitButton>
      </form>
    </AuthFrame>
  );
}
