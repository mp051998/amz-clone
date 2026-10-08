import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section, Card, DemoNote, TextLink } from '@/components/brand/Page';
import { Kicker } from '@/components/decision/Badges';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { selectClass } from '@/components/lib/controls';
import { cn } from '@/components/lib/cn';
import { longDate, shortDate } from '@/components/orders/format';
import { activatePayLaterAction, repayPayLaterAction } from '@/app/actions/pay-later';
import { readUser } from '@/lib/auth';
import { CHECKOUT_BANKS } from '@/lib/bank-offers';
import { listPayLaterRepayments, nextBillOn, payLater, payLaterActivity, payLaterOffer, type PayLaterActivity } from '@/lib/data/pay-later';
import { listTransactions } from '@/lib/data/transactions';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { storeDay } from '@/lib/subscribe-save';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Pay Later · Store Pay' };

type SP = { activated?: string; repaid?: string; error?: string };

const ERROR: Record<string, string> = {
  amount: 'Enter an amount more than nothing and no more than what you owe.',
  method: 'Choose how to pay: UPI or net banking.',
};

function activityText(a: PayLaterActivity): string {
  if (a.kind === 'purchase') return `Order ${a.orderId ?? ''}`.trim();
  if (a.kind === 'refund') return `Refund · order ${a.orderId ?? ''}`.trim();
  return a.repayment?.method === 'netbanking' ? `Repayment · Net banking${a.repayment.bank ? ` · ${a.repayment.bank}` : ''}` : 'Repayment · UPI';
}

const radio = 'mt-0.5 size-4 flex-none accent-ink';
const choice = 'flex cursor-pointer items-start gap-2.5 rounded-input border border-line bg-surface p-3 text-[14px] has-[:checked]:border-ink';

/**
 * Pay Later (amazon.in's Amazon Pay Later; a demo: no credit check, nothing is lent): activate it,
 * see what's free of the limit and the bill, repay, and the activity.
 */
export default async function PayLaterPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const store = await getMarketplace();
  const path = (p: string) => storePath(store, p);
  const money = (minor: number) => formatMoney(minor, store.currency.code);
  const user = await readUser();
  const client = await db();
  const offer = await payLaterOffer(client, store.id);
  if (offer === null) notFound();
  const account = user ? await payLater(client).catch(() => null) : null;
  const [transactions, repayments] = account
    ? await Promise.all([listTransactions(client, store.id, user!.id), listPayLaterRepayments(client)])
    : [[], []];
  const activity = payLaterActivity(transactions, repayments);
  const date = (on: string) => longDate(storeDay(on), store);
  const repaid = Number(sp.repaid);

  return (
    <AppShell>
      <Page>
        <PageHead kicker="Store Pay · Pay Later" title="Buy now, pay next month">
          Pay for orders up to your limit with Pay Later at checkout. Everything you buy in a month comes on one bill on the 1st, due by the 5th, with no interest.
        </PageHead>

        {!user ? (
          <Card className="flex flex-col items-start gap-3">
            <p className="m-0 text-[14px] text-ink-2">Sign in to activate Pay Later and get {money(offer)} to spend, in seconds.</p>
            <a href={path('/signin?next=/amazon-pay/later')} className={buttonClasses({ variant: 'dark' })}>Sign in to activate</a>
          </Card>
        ) : !account ? (
          <Card className="flex flex-col items-start gap-3">
            <Kicker>Instant activation</Kicker>
            <p className="m-0 text-[28px] font-bold leading-none tracking-[-0.01em] tabular-nums">{money(offer)}</p>
            <p className="m-0 text-[14px] text-ink-2">to spend on Pay Later, with no paperwork.</p>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[14px] text-ink-2">
              <li>Choose Pay Later at checkout, and pay for the order next month.</li>
              <li>One bill on the 1st for the month before, due by the 5th, with no interest.</li>
              <li>Refunds of Pay Later orders go back to Pay Later, and free up your limit.</li>
            </ul>
            <form action={activatePayLaterAction}>
              <button type="submit" className={buttonClasses({ variant: 'primary', size: 'lg' })}>Activate Pay Later</button>
            </form>
          </Card>
        ) : (
          <>
            {sp.activated ? <Alert tone="success">Pay Later is ready: you have {money(account.availableMinor)} to spend. Choose it at checkout.</Alert> : null}
            {Number.isInteger(repaid) && repaid > 0 ? <Alert tone="success">Thanks, {money(repaid)} is repaid.</Alert> : null}
            {account.overdue && account.dueOn ? (
              <Alert tone="error">Your bill of {money(account.billMinor)} was due on {date(account.dueOn)}. Pay it to use Pay Later again.</Alert>
            ) : null}

            <div className="grid gap-3.5 md:grid-cols-2">
              <Card className="flex flex-col gap-2">
                <Kicker>Available limit</Kicker>
                <p className="m-0 text-[32px] font-bold leading-none tracking-[-0.01em] tabular-nums">{money(account.availableMinor)}</p>
                <p className="m-0 text-[14px] text-ink-2">of {money(account.limitMinor)}</p>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(100, Math.round((account.usedMinor / account.limitMinor) * 100))}%` }} />
                </div>
                <p className="m-0 text-[14px] text-ink-2">
                  Used: <b className="text-ink tabular-nums">{money(account.usedMinor)}</b>
                  {account.creditMinor > 0 ? <> · Credit: <b className="text-good tabular-nums">{money(account.creditMinor)}</b>, used up by your next purchases</> : null}
                </p>
              </Card>
              <Card className="flex flex-col gap-2">
                <Kicker>Your bill</Kicker>
                {account.billMinor > 0 && account.dueOn ? (
                  <>
                    <p className="m-0 text-[32px] font-bold leading-none tracking-[-0.01em] tabular-nums">{money(account.billMinor)}</p>
                    <p className={cn('m-0 text-[14px]', account.overdue ? 'font-semibold text-bad' : 'text-ink-2')}>
                      {account.overdue ? `Overdue: it was due on ${date(account.dueOn)}` : `Due by ${date(account.dueOn)}`}
                    </p>
                  </>
                ) : (
                  <p className="m-0 text-[15px] text-ink-2">Nothing to pay. You&apos;re all caught up.</p>
                )}
                {account.unbilledMinor > 0 ? (
                  <p className="m-0 text-[14px] text-ink-2">
                    <b className="text-ink tabular-nums">{money(account.unbilledMinor)}</b> spent since the 1st goes on your next bill, on {shortDate(storeDay(nextBillOn(new Date(), store.dates.timeZone)), store)}.
                  </p>
                ) : null}
              </Card>
            </div>

            {account.usedMinor > 0 ? (
              <Section id="repay" title="Pay now" note="Repay early any time; it frees up your limit at once" className="scroll-mt-28">
                <Card>
                  <form action={repayPayLaterAction} className="flex max-w-[560px] flex-col gap-4">
                    {sp.error ? <Alert tone="error">{ERROR[sp.error] ?? ERROR.amount}</Alert> : null}
                    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                      <legend className="mb-2 text-[15px] font-semibold">Amount</legend>
                      {account.billMinor > 0 ? (
                        <label className={choice}>
                          <input type="radio" name="amount" value="bill" defaultChecked className={radio} />
                          <span><span className="font-semibold">Your bill: {money(account.billMinor)}</span></span>
                        </label>
                      ) : null}
                      {account.usedMinor !== account.billMinor ? (
                        <label className={choice}>
                          <input type="radio" name="amount" value="all" defaultChecked={account.billMinor === 0} className={radio} />
                          <span><span className="font-semibold">Everything you owe: {money(account.usedMinor)}</span></span>
                        </label>
                      ) : null}
                      <label className={choice}>
                        <input type="radio" name="amount" value="other" className={radio} />
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">Another amount</span>
                          <span className="flex items-center gap-1">
                            <span aria-hidden>{store.currency.symbol}</span>
                            <input name="other" inputMode="decimal" aria-label="Amount to pay" className="h-9 w-32 rounded-input border border-line-3 bg-surface px-2 tabular-nums" />
                          </span>
                        </span>
                      </label>
                    </fieldset>
                    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                      <legend className="mb-2 text-[15px] font-semibold">Pay with</legend>
                      <label className={choice}>
                        <input type="radio" name="method" value="upi" defaultChecked className={radio} />
                        <span className="font-semibold">UPI</span>
                      </label>
                      <label className={choice}>
                        <input type="radio" name="method" value="netbanking" className={radio} />
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">Net banking</span>
                          <select name="bank" aria-label="Bank" defaultValue={CHECKOUT_BANKS[0]} className={selectClass}>
                            {CHECKOUT_BANKS.map((b) => (<option key={b} value={b}>{b}</option>))}
                          </select>
                        </span>
                      </label>
                    </fieldset>
                    <div>
                      <button type="submit" className={buttonClasses({ variant: 'primary' })}>Pay now</button>
                    </div>
                  </form>
                </Card>
              </Section>
            ) : null}

            <Section title="Activity">
              <Card>
                {activity.length ? (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {activity.map((a) => (
                      <li key={a.key} className="flex items-baseline justify-between gap-3 text-[14px]">
                        <span className="min-w-0">
                          <span className="block truncate text-ink">
                            {a.orderId ? <a href={path(`/orders/${encodeURIComponent(a.orderId)}`)} className="text-ink underline-offset-2 hover:underline">{activityText(a)}</a> : activityText(a)}
                          </span>
                          <span className="text-[13px] text-ink-3">{shortDate(new Date(a.at), store)}</span>
                        </span>
                        <span className={cn('flex-none font-semibold tabular-nums', a.kind === 'purchase' ? 'text-ink' : 'text-good')}>
                          {a.kind === 'purchase' ? '' : '−'}{money(a.amountMinor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 text-[14px] text-ink-2">Nothing yet. Orders paid with Pay Later, their refunds and your repayments show up here.</p>
                )}
              </Card>
            </Section>
            <TextLink href={path('/amazon-pay')}>Back to Store Pay</TextLink>
          </>
        )}

        <DemoNote>Demo store — no credit check is made and nothing is lent or charged.</DemoNote>
      </Page>
    </AppShell>
  );
}
