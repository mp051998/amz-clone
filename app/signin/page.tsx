import type { Metadata } from 'next';
import { Wordmark } from '@/components/chrome/Wordmark';
import { Alert } from '@/components/primitives/Alert';
import { Button, buttonClasses } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { signIn } from '@/app/actions/auth';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ new?: string }> }): Promise<Metadata> {
  const { new: isNew } = await searchParams;
  return { title: isNew === '1' ? 'Create account · Store' : 'Sign in · Store' };
}

const ERRORS: Record<string, string> = {
  missing: 'Enter both your email and password.',
  badcreds: 'Wrong email or password. Try again, or create an account.',
  exists: 'An account already exists for that email. Sign in instead.',
  weakpw: 'Password must be at least 6 characters.',
  confirm: 'Check your inbox to confirm your email, then sign in. (Or ask the admin to turn off email confirmation.)',
  signup: "We couldn't create your account. Try again.",
  '1': 'Enter a valid email address.',
};

/** Why the shopper was sent here, from the `next` path. */
function reasonFor(next: string): string | null {
  const path = next.replace(/^\/in(?=\/|$)/, '') || '/';
  if (path.startsWith('/checkout')) return 'Sign in to check out — your cart comes with you.';
  if (path.startsWith('/collections') || path.startsWith('/product') || path.startsWith('/s')) return 'Sign in to save products and track their prices.';
  if (path.startsWith('/orders')) return 'Sign in to see and track your orders.';
  if (path.startsWith('/account')) return 'Sign in to manage your account.';
  return null;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; new?: string }>;
}) {
  const { next = '/', error, new: isNew } = await searchParams;
  const creating = isNew === '1';
  const store = await getMarketplace();
  const homeHref = storePath(store, '/');
  const toggleHref = creating
    ? `${storePath(store, '/signin')}?next=${encodeURIComponent(next)}`
    : `${storePath(store, '/signin')}?new=1&next=${encodeURIComponent(next)}`;
  const reason = reasonFor(next);

  return (
    <div className="flex min-h-screen flex-col items-center bg-bg px-4 pt-10">
      <a href={homeHref} aria-label="Store home" className="mb-6 no-underline"><Wordmark /></a>

      <main id="main" className="flex w-full max-w-[400px] flex-col gap-4">
        <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6">
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-[26px] font-semibold tracking-[-0.01em]">{creating ? 'Create your account' : 'Sign in'}</h1>
            <span className="text-[14px] text-ink-2">
              {reason ?? (creating ? 'Save products, track prices and check out faster.' : 'Welcome back.')}
            </span>
          </div>

          {error ? <Alert tone="error">{ERRORS[error] ?? 'Something went wrong. Try again.'}</Alert> : null}

          <form action={signIn} className="flex flex-col gap-3.5">
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="mode" value={creating ? 'create' : 'signin'} />
            {creating ? <Input name="name" label="Your name" placeholder="First and last name" autoComplete="name" required /> : null}
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
            <Button type="submit" variant="primary" size="lg" block className="mt-1">
              {creating ? 'Create account' : 'Sign in'}
            </Button>
          </form>

          <p className="m-0 text-[13px] leading-[1.45] text-ink-3">
            Real accounts — your email and password are stored securely with Supabase. By continuing you agree to this demo’s conditions of use.
          </p>
        </div>

        <div className="flex items-center gap-3 text-[13px] text-ink-3">
          <span className="h-px flex-1 bg-line" />
          {creating ? 'Already have an account?' : 'New here?'}
          <span className="h-px flex-1 bg-line" />
        </div>
        <a href={toggleHref} className={buttonClasses({ variant: 'secondary', size: 'lg', block: true })}>
          {creating ? 'Sign in instead' : 'Create an account'}
        </a>
      </main>

      <footer className="mt-12 py-6 text-center text-[12px] text-ink-3">
        Unofficial demo store — not affiliated with any real retailer. No real orders or payments.
      </footer>
    </div>
  );
}
