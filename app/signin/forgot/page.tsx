import type { Metadata } from 'next';
import { AuthCard, AuthFrame } from '@/components/chrome/AuthFrame';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { requestPasswordReset } from '@/app/actions/account';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { SubmitButton } from '@/components/primitives/SubmitButton';

export const metadata: Metadata = { title: 'Reset your password · Store' };

const ERRORS: Record<string, string> = {
  email: 'Enter a valid email address.',
  wait: 'We just sent a link. Wait a minute before asking for another one.',
  link: 'That link has expired or was already used. Links work once, for an hour, in the browser you asked from. Ask for a new one below.',
};

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams;
  const store = await getMarketplace();
  const signinHref = storePath(store, '/signin');

  return (
    <AuthFrame homeHref={storePath(store, '/')}>
      <AuthCard
        title="Reset your password"
        lead="Enter the email you shop with. We’ll send a link to set a new password."
      >
        {sent ? (
          <Alert tone="success">
            If there’s an account for that email, a reset link is on its way. Open it in this browser within the hour. Nothing
            arrived? Check your spam folder, or ask again in a minute.
          </Alert>
        ) : null}
        {error ? <Alert tone="error">{ERRORS[error] ?? 'Something went wrong. Try again.'}</Alert> : null}

        <form action={requestPasswordReset} className="flex flex-col gap-3.5">
          <Input name="email" type="email" label="Email" required autoComplete="email" className="text-[16px]" />
          <SubmitButton variant="primary" size="lg" block className="mt-1" pendingLabel="Sending…">
            {sent ? 'Send another link' : 'Send reset link'}
          </SubmitButton>
        </form>
      </AuthCard>

      <a href={signinHref} className={buttonClasses({ variant: 'secondary', size: 'lg', block: true })}>
        Back to sign in
      </a>
    </AuthFrame>
  );
}
