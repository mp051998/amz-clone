import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PayMethods, payChoice, payRadio } from '@/components/amazon-pay/PayMethods';
import { Page, PageHead, Section, Card, DemoNote, TextLink } from '@/components/brand/Page';
import { Kicker } from '@/components/decision/Badges';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { fieldClass, selectClass } from '@/components/lib/controls';
import { cn } from '@/components/lib/cn';
import { shortDate } from '@/components/orders/format';
import { rechargeAction } from '@/app/actions/recharge';
import { readUser } from '@/lib/auth';
import { storeBalance } from '@/lib/data/balance';
import { listRechargePlans, listRecharges, recentNumbers, type RechargePlan } from '@/lib/data/recharges';
import { getMarketplace } from '@/lib/marketplace-server';
import { signInPath, storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { CIRCLES, formatMobile, isCircle, isOperator, mobileNumber, OPERATORS, RECHARGE_CASHBACK_CAP_MINOR, RECHARGE_CASHBACK_PCT, rechargeCashback } from '@/lib/recharge';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Mobile recharge · Store Pay' };

type SP = { number?: string; operator?: string; circle?: string; done?: string; error?: string };

const ERROR: Record<string, string> = {
  number: 'Enter a 10-digit mobile number.',
  operator: 'Choose the number’s operator.',
  circle: 'Choose the number’s circle.',
  plan: 'Choose a plan.',
  method: 'Choose how to pay.',
  balance: 'Your balance doesn’t cover this plan. Add to it, or pay by UPI or net banking.',
};


/** "28 days · 1.5 GB/day · Unlimited calls · 100 SMS/day" */
function benefits(p: RechargePlan): string {
  return [
    p.validityDays ? `${p.validityDays} days` : 'Your current plan’s validity',
    p.data,
    p.calls ? `${p.calls} calls` : null,
    p.sms ? `${p.sms} SMS` : null,
  ].filter(Boolean).join(' · ');
}

/**
 * Mobile recharge (amazon.in's Amazon Pay recharges; a demo: nothing is recharged or charged):
 * enter a prepaid number, its operator and circle, pick a plan and pay with the balance, UPI or
 * net banking, earning cashback on the balance; recent numbers can be recharged again.
 */
export default async function RechargePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const store = await getMarketplace();
  if (store.id !== 'IN') notFound();
  const path = (p: string) => storePath(store, p);
  const money = (minor: number) => formatMoney(minor, store.currency.code);
  const user = await readUser();
  const client = await db();

  const number = mobileNumber(sp.number);
  const operator = isOperator(sp.operator) ? sp.operator : null;
  const circle = isCircle(sp.circle) ? sp.circle : null;
  // the details were sent, and one of them isn't right
  const asked = sp.number != null || sp.operator != null || sp.circle != null;
  const fieldError = asked && !sp.done ? (!number ? 'number' : !operator ? 'operator' : !circle ? 'circle' : null) : null;
  const ready = number && operator && circle;

  const [plans, recharges, balance] = await Promise.all([
    ready ? listRechargePlans(client, store.id, operator) : [],
    user ? listRecharges(client, store.id).catch(() => []) : [],
    user ? storeBalance(client, store.id).catch(() => null) : null,
  ]);
  const done = sp.done ? recharges.find((r) => r.id === sp.done) : undefined;
  const recent = recentNumbers(recharges);
  const unlimited = plans.filter((p) => p.kind === 'unlimited');
  const packs = plans.filter((p) => p.kind === 'data');
  const again = (r: { number: string; operator: string; circle: string }) =>
    path(`/amazon-pay/recharge?${new URLSearchParams({ number: r.number, operator: r.operator, circle: r.circle }).toString()}#pay`);

  const planChoice = (p: RechargePlan, first: boolean) => (
    <label key={p.id} className={payChoice}>
      <input type="radio" name="plan" value={p.id} defaultChecked={first} className={payRadio} />
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[17px] font-bold tabular-nums">{money(p.amountMinor)}</span>
          <span className="text-[13px] text-ink-2">{benefits(p)}</span>
        </span>
        {rechargeCashback(p.amountMinor) > 0 ? (
          <span className="text-[13px] font-semibold text-good tabular-nums">{money(rechargeCashback(p.amountMinor))} cashback</span>
        ) : null}
      </span>
    </label>
  );

  return (
    <AppShell>
      <Page>
        <PageHead kicker="Store Pay · Recharges" title="Mobile recharge">
          Recharge any prepaid number in seconds, and get {RECHARGE_CASHBACK_PCT}% back on your balance (up to {money(RECHARGE_CASHBACK_CAP_MINOR)}) on every recharge.
        </PageHead>

        {done ? (
          <Alert tone="success">
            Recharge of {money(done.amountMinor)} for {formatMobile(done.number)} ({done.operator}, {done.circle}) is done.
            {done.cashbackMinor > 0 ? ` ${money(done.cashbackMinor)} cashback is in your balance.` : ''}
          </Alert>
        ) : null}

        <Section title="Number to recharge">
          <Card>
            <form method="get" action={path('/amazon-pay/recharge')} className="flex flex-col gap-3 md:flex-row md:items-end">
              <label className="flex flex-1 flex-col gap-1.5 text-[14px] font-semibold">
                Mobile number
                <input
                  name="number"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="10-digit number"
                  defaultValue={number ?? sp.number ?? ''}
                  aria-invalid={fieldError === 'number' || undefined}
                  className={cn(fieldClass, 'tabular-nums')}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
                Operator
                <select name="operator" defaultValue={operator ?? ''} className={selectClass}>
                  <option value="" disabled>Choose</option>
                  {OPERATORS.map((o) => (<option key={o} value={o}>{o}</option>))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
                Circle
                <select name="circle" defaultValue={circle ?? ''} className={selectClass}>
                  <option value="" disabled>Choose</option>
                  {CIRCLES.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </label>
              <button type="submit" className={buttonClasses({ variant: 'dark' })}>See plans</button>
            </form>
            {fieldError ? <p role="alert" className="m-0 mt-3 text-[14px] text-bad">{ERROR[fieldError]}</p> : null}
          </Card>
        </Section>

        {ready ? (
          <Section id="pay" title={`${operator} plans for ${formatMobile(number)}`} note={circle} className="scroll-mt-28">
            <Card>
              <form action={rechargeAction} className="flex max-w-[640px] flex-col gap-4">
                {sp.error && ERROR[sp.error] ? <Alert tone="error">{ERROR[sp.error]}</Alert> : null}
                <input type="hidden" name="number" value={number} />
                <input type="hidden" name="operator" value={operator} />
                <input type="hidden" name="circle" value={circle} />
                {unlimited.length ? (
                  <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                    <legend className="mb-2 text-[15px] font-semibold">Unlimited plans</legend>
                    {unlimited.map((p, i) => planChoice(p, i === 0))}
                  </fieldset>
                ) : null}
                {packs.length ? (
                  <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                    <legend className="mb-2 text-[15px] font-semibold">Data packs</legend>
                    {packs.map((p) => planChoice(p, !unlimited.length && p === packs[0]))}
                  </fieldset>
                ) : null}
                <PayMethods balance={balance} money={money} />
                <div>
                  {user ? (
                    <button type="submit" className={buttonClasses({ variant: 'primary', size: 'lg' })}>Recharge</button>
                  ) : (
                    <a href={signInPath(store, `/amazon-pay/recharge?${new URLSearchParams({ number, operator, circle }).toString()}`)} className={buttonClasses({ variant: 'primary', size: 'lg' })}>
                      Sign in to recharge
                    </a>
                  )}
                </div>
              </form>
            </Card>
          </Section>
        ) : null}

        {recent.length ? (
          <Section title="Recharge again">
            <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
              {recent.map((r) => (
                <Card key={r.id} as="li" className="flex flex-col gap-1.5">
                  <Kicker>{r.operator} · {r.circle}</Kicker>
                  <span className="text-[17px] font-semibold tabular-nums">{formatMobile(r.number)}</span>
                  <span className="text-[13px] text-ink-2">Last: {money(r.amountMinor)} on {shortDate(new Date(r.at), store)}</span>
                  <TextLink href={again(r)}>Recharge again</TextLink>
                </Card>
              ))}
            </ul>
          </Section>
        ) : null}

        {recharges.length ? (
          <Section title="Your recharges">
            <Card>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {recharges.map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{formatMobile(r.number)} · {r.operator}</span>
                      <span className="text-[13px] text-ink-3">
                        {shortDate(new Date(r.at), store)}
                        {r.cashbackMinor > 0 ? ` · ${money(r.cashbackMinor)} cashback` : ''}
                      </span>
                    </span>
                    <span className="flex-none font-semibold tabular-nums">{money(r.amountMinor)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        ) : null}

        <TextLink href={path('/amazon-pay')}>Back to Store Pay</TextLink>
        <DemoNote>Demo store — the plans are examples; no operator is reached and nothing is recharged or charged.</DemoNote>
      </Page>
    </AppShell>
  );
}
