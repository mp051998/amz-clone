import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Alert } from '@/components/primitives/Alert';
import { CloseAccountForm, EmailForm, NameForm, PasswordForm } from '@/components/account/SecurityForms';
import { readUser } from '@/lib/auth';
import { closureCheck, closureMessage, isRecovery, listPhrase } from '@/lib/data/account';
import { db } from '@/lib/supabase/server';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { closeMyAccount, updateEmail, updateName, updatePassword } from '@/app/actions/account';

export const metadata: Metadata = { title: 'Login & security · Store' };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { done } = await searchParams;
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const user = await readUser();
  if (!user) redirect(sp('/signin?next=/account/security'));
  const client = await db();
  const [{ data }, closure] = await Promise.all([client.auth.getClaims(), closureCheck(client).catch(() => null)]);
  const recovering = isRecovery(data?.claims);
  const losing = closure?.balances.length ? listPhrase(closure.balances.map((b) => formatMoney(b.balanceMinor, b.currency))) : null;

  const password = <PasswordForm action={updatePassword} recovering={recovering} />;
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-[18px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <nav aria-label="Breadcrumb" className="text-[14px] text-ink-2">
          <a href={sp('/account')} className="text-ink-2 underline underline-offset-2 hover:text-ink">Account</a>
          <span aria-hidden> › </span>
          <span className="text-ink">Login &amp; security</span>
        </nav>
        <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Login &amp; security</h1>

        {done === 'password' ? <Alert tone="success">New password set. You’re signed in, and signed out everywhere else.</Alert> : null}
        {/* after a reset link, setting the password is the only thing the visitor came for */}
        {recovering ? password : null}
        <NameForm action={updateName} name={user.name} />
        <EmailForm action={updateEmail} email={user.email} />
        {recovering ? null : password}
        {closure ? (
          <CloseAccountForm action={closeMyAccount} blocked={closureMessage(closure)} losing={losing} ordersHref={sp('/orders')} />
        ) : null}
      </div>
    </AppShell>
  );
}
