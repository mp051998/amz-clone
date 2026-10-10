import type { Metadata } from 'next';
import { AuthCard, AuthFrame } from '@/components/chrome/AuthFrame';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { signIn } from '@/app/actions/auth';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { SubmitButton } from '@/components/primitives/SubmitButton';

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ new?: string }> }): Promise<Metadata> {
  const { new: isNew } = await searchParams;
  return { title: isNew === '1' ? 'Create account · Store' : 'Sign in · Store' };
}

const ERRORS: Record<string, string> = {
  missing: 'Enter both your email and password.',
  badcreds: 'Wrong email or password. Try again, or create an account.',
  exists: 'An account already exists for that email. Sign in instead.',
  password: 'Password must be at least 6 characters.',
  weakpw: 'Password must be at least 6 characters.',
  email: 'Enter a valid email address.',
  name: 'Keep your name under 80 characters.',
  signup: "We couldn't create your account. Try again.",
  '1': 'Enter a valid email address.',
  expired: 'Your sign-in timed out. Sign in again.',
};

/** Why the shopper was sent here, from the `next` path. */
function reasonFor(next: string): string | null {
  const path = next.replace(/^\/in(?=\/|$)/, '') || '/';
  if (path.startsWith('/checkout')) return 'Sign in to check out — your cart comes with you.';
  if (path.startsWith('/collections') || path.startsWith('/product') || path.startsWith('/s')) return 'Sign in to save products and track their prices.';
  if (path.startsWith('/orders')) return 'Sign in to see and track your orders.';
  if (path.startsWith('/account')) return 'Sign in to manage your account.';
  if (path.startsWith('/admin')) return 'Sign in with an admin account to manage the catalogue.';
  return null;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; new?: string; closed?: string }>;
}) {
  const { next = '/', error, new: isNew, closed } = await searchParams;
  const creating = isNew === '1';
  const store = await getMarketplace();
  const homeHref = storePath(store, '/');
  const toggleHref = creating
    ? `${storePath(store, '/signin')}?next=${encodeURIComponent(next)}`
    : `${storePath(store, '/signin')}?new=1&next=${encodeURIComponent(next)}`;
  const reason = reasonFor(next);
  const forgotHref = storePath(store, '/signin/forgot');

  return (
    <AuthFrame homeHref={homeHref}>
      <AuthCard
        title={creating ? 'Create your account' : 'Sign in'}
        lead={reason ?? (creating ? 'Save products, track prices and check out faster.' : 'Welcome back.')}
      >
        {closed === '1' && !error ? <Alert tone="success">Your account is closed. Thanks for shopping with us.</Alert> : null}
        {error ? <Alert tone="error">{ERRORS[error] ?? 'Something went wrong. Try again.'}</Alert> : null}

        <form action={signIn} className="flex flex-col gap-3.5">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="mode" value={creating ? 'create' : 'signin'} />
          {creating ? <Input name="name" label="Your name" placeholder="First and last name" autoComplete="name" maxLength={80} required /> : null}
          <Input name="email" type="email" label="Email" required autoComplete="email" className="text-[16px]" />
          <Input
            name="password"
            type="password"
            label="Password"
            required
            minLength={creating ? 6 : undefined}
            hint={creating ? 'At least 6 characters.' : undefined}
            autoComplete={creating ? 'new-password' : 'current-password'}
            className="text-[16px]"
          />
          {creating ? null : (
            <a href={forgotHref} className="-mt-1 self-start text-[14px] text-ink underline underline-offset-2 hover:text-accent-ink">
              Forgot your password?
            </a>
          )}
          <SubmitButton variant="primary" size="lg" block className="mt-1" pendingLabel={creating ? 'Creating your account…' : 'Signing in…'}>
            {creating ? 'Create account' : 'Sign in'}
          </SubmitButton>
        </form>

        <p className="m-0 text-[13px] leading-[1.45] text-ink-3">
          Real accounts — your email and password are stored securely with Supabase. By continuing you agree to this demo’s conditions of use.
        </p>
      </AuthCard>

      <div className="flex items-center gap-3 text-[13px] text-ink-3">
        <span className="h-px flex-1 bg-line" />
        {creating ? 'Already have an account?' : 'New here?'}
        <span className="h-px flex-1 bg-line" />
      </div>
      <a href={toggleHref} className={buttonClasses({ variant: 'secondary', size: 'lg', block: true })}>
        {creating ? 'Sign in instead' : 'Create an account'}
      </a>
    </AuthFrame>
  );
}
