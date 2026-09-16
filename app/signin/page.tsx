import type { Metadata } from 'next';
import { Wordmark } from '@/components/chrome/Wordmark';
import { Input } from '@/components/primitives/Input';
import { signIn } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Sign in | Amazon.com' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; new?: string }>;
}) {
  const { next = '/', error, new: isNew } = await searchParams;
  const creating = isNew === '1';

  return (
    <div className="flex min-h-screen flex-col items-center bg-white px-4 pt-6">
      <a href="/" aria-label="Amazon" className="mb-4"><Wordmark tone="dark" tld="com" /></a>

      <div className="w-full max-w-[350px] rounded-[8px] border border-line p-6">
        <h1 className="text-[28px] font-normal text-ink">{creating ? 'Create account' : 'Sign in'}</h1>

        {error ? (
          <div className="mt-3 rounded-[4px] border border-error bg-[#FFF5F5] p-2 text-[13px] text-error">
            Enter a valid email address.
          </div>
        ) : null}

        <form action={signIn} className="mt-4 space-y-3">
          <input type="hidden" name="next" value={next} />
          {creating ? <Input name="name" label="Your name" placeholder="First and last name" required /> : null}
          <Input name="email" type="email" label="Email" required defaultValue={creating ? '' : 'alex.morgan@example.com'} />
          <Input name="password" type="password" label="Password" required defaultValue={creating ? '' : 'demo-password'} />
          <button type="submit" className="h-[33px] w-full rounded-pill bg-cta-yellow text-[14px] text-ink shadow-input hover:bg-cta-yellow-hover">
            {creating ? 'Create your account' : 'Sign in'}
          </button>
        </form>

        <p className="mt-3 text-[12px] leading-4 text-ink-2">
          Demo only — any email and password sign you in. By continuing, you agree to this demo&apos;s Conditions of Use.
        </p>
      </div>

      <div className="mt-4 flex w-full max-w-[350px] items-center gap-3 text-[12px] text-ink-4">
        <span className="h-px flex-1 bg-line" />
        {creating ? 'Already have an account?' : 'New to Amazon?'}
        <span className="h-px flex-1 bg-line" />
      </div>
      <a
        href={creating ? `/signin?next=${encodeURIComponent(next)}` : `/signin?new=1&next=${encodeURIComponent(next)}`}
        className="mt-3 flex h-[31px] w-full max-w-[350px] items-center justify-center rounded-pill border border-line bg-surface-3 text-[13px] text-ink hover:bg-surface-2"
      >
        {creating ? 'Sign in to existing account' : 'Create your Amazon account'}
      </a>

      <footer className="mt-10 border-t border-line-3 py-6 text-center text-[11px] text-ink-4">
        Unofficial demo clone — not affiliated with Amazon.com, Inc.
      </footer>
    </div>
  );
}
