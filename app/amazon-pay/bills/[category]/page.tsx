import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PayMethods } from '@/components/amazon-pay/PayMethods';
import { Page, PageHead, Section, Card, DemoNote, TextLink } from '@/components/brand/Page';
import { Kicker } from '@/components/decision/Badges';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { fieldClass, selectClass } from '@/components/lib/controls';
import { cn } from '@/components/lib/cn';
import { shortDate } from '@/components/orders/format';
import { payBillAction } from '@/app/actions/bills';
import { readUser } from '@/lib/auth';
import { BILL_CATEGORIES, BILL_CATEGORY, billAccount, billMonth, isBillAccount, isBillCategory, type BillCategory } from '@/lib/bills';
import { storeBalance } from '@/lib/data/balance';
import { fetchBill, listBillers, listBillPayments, recentBillAccounts, type Biller } from '@/lib/data/bills';
import { getMarketplace } from '@/lib/marketplace-server';
import { signInPath, storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';

type Params = { category: string };
type SP = { biller?: string; account?: string; amount?: string; done?: string; error?: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { category } = await params;
  return { title: `${isBillCategory(category) ? BILL_CATEGORY[category].title : 'Pay bills'} · Store Pay` };
}

const INTRO: Record<BillCategory, string> = {
  electricity: 'Fetch your latest electricity bill and pay it in seconds, from your balance, by UPI or net banking.',
  dth: 'Recharge your DTH connection with any amount, from your balance, by UPI or net banking.',
  broadband: 'Fetch your broadband or landline bill and pay it in seconds, from your balance, by UPI or net banking.',
  gas: 'Fetch your piped gas bill and pay it in seconds, from your balance, by UPI or net banking.',
  water: 'Fetch your water bill and pay it in seconds, from your balance, by UPI or net banking.',
  fastag: 'Top up your vehicle’s FASTag with any amount, from your balance, by UPI or net banking.',
};

/** The errors the pay form comes back with (`payBillAction`). */
function payError(error: string | undefined, biller: Biller | null, money: (minor: number) => string): string | null {
  switch (error) {
    case 'amount':
      return biller && !biller.fetches ? `Enter an amount in whole rupees, from ${money(biller.minMinor)} to ${money(biller.maxMinor)}.` : 'Pay this month’s bill in full.';
    case 'method': return 'Choose how to pay.';
    case 'balance': return 'Your balance doesn’t cover this payment. Add to it, or pay by UPI or net banking.';
    case 'paid': return 'This month’s bill is already paid.';
    case 'changed': return 'This bill has changed since you fetched it. Check the amount and pay again.';
    case 'biller': return 'Choose your biller.';
    case 'account': return biller ? `Enter a valid ${biller.accountLabel}: ${biller.accountHint}.` : 'Enter your account number.';
    default: return null;
  }
}

/**
 * Pay bills (amazon.in's Amazon Pay bill payments; a demo: no biller is reached and nothing is paid
 * or charged), one page a kind of biller: choose the biller and enter the account; a biller that
 * sends bills shows this month's, paid in full, and the others (DTH, FASTag) take any amount within
 * their limits. Pay with the balance, UPI or net banking; accounts paid lately can be paid again.
 */
export default async function BillsPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<SP> }) {
  const [{ category }, sp] = await Promise.all([params, searchParams]);
  const store = await getMarketplace();
  if (store.id !== 'IN' || !isBillCategory(category)) notFound();
  const kind = BILL_CATEGORY[category];
  const path = (p: string) => storePath(store, p);
  const page = `/amazon-pay/bills/${category}`;
  const money = (minor: number) => formatMoney(minor, store.currency.code);
  const date = (d: string) => shortDate(new Date(d), store);
  const user = await readUser();
  const client = await db();

  const [billers, payments, balance] = await Promise.all([
    listBillers(client, store.id, category),
    user ? listBillPayments(client, store.id, { category }).catch(() => []) : [],
    user ? storeBalance(client, store.id).catch(() => null) : null,
  ]);
  const biller = billers.find((b) => b.id === sp.biller) ?? null;
  const account = billAccount(sp.account);
  // the biller and account were sent, and one of them isn't right
  const asked = sp.biller != null || sp.account != null;
  const fieldError = asked && !sp.done ? (!biller ? 'biller' : !isBillAccount(account, biller.accountPattern) ? 'account' : null) : null;
  const ready = biller && !fieldError && isBillAccount(account, biller.accountPattern) ? biller : null;
  const bill = ready?.fetches ? await fetchBill(client, ready.id, account).catch(() => null) : null;
  const done = sp.done ? payments.find((p) => p.id === sp.done) : undefined;
  const recent = recentBillAccounts(payments);
  const fetches = billers.some((b) => b.fetches);
  const error = ready ? payError(sp.error, ready, money) : null;
  const query = (billerId: string, a: string) => new URLSearchParams({ biller: billerId, account: a }).toString();

  const pay = (b: Biller, amount: ReactNode, label: string) => (
    <form action={payBillAction} className="flex max-w-[640px] flex-col gap-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="biller" value={b.id} />
      <input type="hidden" name="account" value={account} />
      {amount}
      <PayMethods balance={balance} money={money} />
      <div>
        {user ? (
          <button type="submit" className={buttonClasses({ variant: 'primary', size: 'lg' })}>{label}</button>
        ) : (
          <a href={signInPath(store, `${page}?${query(b.id, account)}`)} className={buttonClasses({ variant: 'primary', size: 'lg' })}>
            Sign in to pay
          </a>
        )}
      </div>
    </form>
  );

  return (
    <AppShell>
      <Page>
        <PageHead kicker="Store Pay · Pay bills" title={kind.title}>{INTRO[category]}</PageHead>

        <nav aria-label="Pay bills" className="flex flex-wrap gap-2">
          {BILL_CATEGORIES.map((c) => (
            <a
              key={c}
              href={path(`/amazon-pay/bills/${c}`)}
              aria-current={c === category ? 'page' : undefined}
              className={cn('rounded-pill border bg-surface px-3.5 py-1.5 text-[14px] text-ink no-underline hover:border-ink', c === category ? 'border-ink font-semibold' : 'border-line')}
            >
              {BILL_CATEGORY[c].name}
            </a>
          ))}
        </nav>

        {done ? (
          <Alert tone="success">
            Payment of {money(done.amountMinor)} to {done.billerName} for {done.account} is done.
            {done.period ? ` Your ${billMonth(done.period, store.locale.default)} bill is paid.` : ''}
          </Alert>
        ) : null}

        <Section title={fetches ? 'Biller and account' : 'Provider and account'}>
          <Card>
            <form method="get" action={path(page)} className="flex flex-col gap-3 md:flex-row md:items-end">
              <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
                {fetches ? 'Biller' : 'Provider'}
                <select name="biller" defaultValue={biller?.id ?? ''} aria-invalid={fieldError === 'biller' || undefined} className={selectClass}>
                  <option value="" disabled>Choose</option>
                  {billers.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>
              </label>
              <label className="flex flex-1 flex-col gap-1.5 text-[14px] font-semibold">
                {biller?.accountLabel ?? kind.account}
                <input
                  name="account"
                  autoComplete="off"
                  autoCapitalize="characters"
                  placeholder={biller?.accountHint ?? ''}
                  defaultValue={account || sp.account || ''}
                  aria-invalid={fieldError === 'account' || undefined}
                  className={cn(fieldClass, 'tabular-nums')}
                />
              </label>
              <button type="submit" className={buttonClasses({ variant: 'dark' })}>{fetches ? 'Fetch bill' : 'Continue'}</button>
            </form>
            {fieldError ? <p role="alert" className="m-0 mt-3 text-[14px] text-bad">{payError(fieldError, biller, money)}</p> : null}
          </Card>
        </Section>

        {ready?.fetches ? (
          <Section id="pay" title={ready.name} note={`${ready.accountLabel} ${account}`} className="scroll-mt-28">
            <Card className="flex flex-col gap-4">
              {bill ? (
                <>
                  <div className="flex flex-col gap-1">
                    <Kicker>Bill for {billMonth(bill.period, store.locale.default)}</Kicker>
                    <span className="text-[26px] font-bold tabular-nums">{money(bill.amountMinor)}</span>
                    <span className={cn('text-[14px]', bill.overdue && !bill.paid ? 'font-semibold text-bad' : 'text-ink-2')}>
                      {bill.overdue && !bill.paid ? `Overdue: was due ${date(bill.dueOn)}` : `Due ${date(bill.dueOn)}`}
                    </span>
                  </div>
                  {bill.paid ? (
                    <Alert tone="success">You paid this bill on {date(bill.paid.at)}. Nothing more is due this month.</Alert>
                  ) : (
                    pay(ready, <input type="hidden" name="bill" value={bill.amountMinor} />, `Pay ${money(bill.amountMinor)}`)
                  )}
                </>
              ) : (
                <Alert tone="error">We couldn’t fetch this bill. Check the {ready.accountLabel} and try again.</Alert>
              )}
            </Card>
          </Section>
        ) : ready ? (
          <Section id="pay" title={ready.name} note={`${ready.accountLabel} ${account}`} className="scroll-mt-28">
            <Card>
              {pay(
                ready,
                <label className="flex max-w-[280px] flex-col gap-1.5 text-[14px] font-semibold">
                  Amount (₹)
                  <input
                    name="amount"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    defaultValue={sp.amount ?? ''}
                    aria-invalid={sp.error === 'amount' || undefined}
                    aria-describedby="amount-limits"
                    className={cn(fieldClass, 'tabular-nums')}
                  />
                  <span id="amount-limits" className="text-[13px] font-normal text-ink-2">
                    {money(ready.minMinor)} to {money(ready.maxMinor)}, in whole rupees
                  </span>
                </label>,
                'Pay',
              )}
            </Card>
          </Section>
        ) : null}

        {recent.length ? (
          <Section title="Pay again">
            <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
              {recent.map((p) => (
                <Card key={p.id} as="li" className="flex flex-col gap-1.5">
                  <Kicker>{p.billerName}</Kicker>
                  <span className="text-[17px] font-semibold tabular-nums">{p.account}</span>
                  <span className="text-[13px] text-ink-2">Last: {money(p.amountMinor)} on {date(p.at)}</span>
                  <TextLink href={path(`${page}?${query(p.billerId, p.account)}#pay`)}>{p.period ? 'Fetch bill' : 'Pay again'}</TextLink>
                </Card>
              ))}
            </ul>
          </Section>
        ) : null}

        {payments.length ? (
          <Section title="Your payments">
            <Card>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{p.billerName} · <span className="tabular-nums">{p.account}</span></span>
                      <span className="text-[13px] text-ink-3">
                        {date(p.at)}
                        {p.period ? ` · ${billMonth(p.period, store.locale.default)} bill` : ''}
                      </span>
                    </span>
                    <span className="flex-none font-semibold tabular-nums">{money(p.amountMinor)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        ) : null}

        <TextLink href={path('/amazon-pay')}>Back to Store Pay</TextLink>
        <DemoNote>Demo store — the billers are examples and the bills are made up; no biller is reached and nothing is paid or charged.</DemoNote>
      </Page>
    </AppShell>
  );
}
