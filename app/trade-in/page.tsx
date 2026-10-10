import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { payChoice, payRadio } from '@/components/amazon-pay/PayMethods';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { Page, PageHead, Section, Card, InfoCard, DemoNote, TextLink } from '@/components/brand/Page';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { selectClass } from '@/components/lib/controls';
import { StatusChip } from '@/components/orders/Tracking';
import { shortDate, type ChipTone } from '@/components/orders/format';
import { cancelTradeInAction, requestTradeInAction } from '@/app/actions/trade-in';
import { readUser } from '@/lib/auth';
import { listExchangeDevices } from '@/lib/data/exchange';
import { listTradeIns, type TradeIn } from '@/lib/data/trade-ins';
import { CONDITION_LABEL, EXCHANGE_CONDITIONS, isExchangeCondition, type ExchangeDevice } from '@/lib/exchange';
import { getMarketplace } from '@/lib/marketplace-server';
import { signInPath, storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { hasTradeIn, TRADE_IN_OPEN_LIMIT, TRADE_IN_SHIP_DAYS, TRADE_IN_STATUS_LABEL, tradeInValue, type TradeInStatus } from '@/lib/trade-in';
import { db } from '@/lib/supabase/server';
import { SubmitButton } from '@/components/primitives/SubmitButton';

export const metadata: Metadata = { title: 'Trade-In · Store' };

type SP = { device?: string; condition?: string; done?: string; cancelled?: string; error?: string };

const ERROR: Record<string, string> = {
  device: 'Choose a model from the list.',
  condition: 'Tell us what state it’s in.',
  limit: `You have ${TRADE_IN_OPEN_LIMIT} trade-ins waiting to be sent. Send or cancel one to start another.`,
  closed: 'That trade-in is already closed.',
};

const TONE: Record<TradeInStatus, ChipTone> = { open: 'warn', credited: 'good', cancelled: 'neutral', rejected: 'neutral' };

const KIND_HEADING = { phone: 'Phones', laptop: 'Laptops' } as const;

/**
 * Trade-In (amazon.com's; a demo: nothing is shipped): pick an old phone or laptop and what state
 * it's in for a quote, trade it in, send it within 7 days with the prepaid label, and get the value
 * as gift card credit on the store balance once the store has checked it. The shopper's trade-ins,
 * with the open ones' label codes, follow; an open one can be cancelled.
 */
export default async function TradeInPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const store = await getMarketplace();
  if (!hasTradeIn(store.id)) notFound();
  const path = (p: string) => storePath(store, p);
  const money = (minor: number) => formatMoney(minor, store.currency.code);
  const date = (iso: string) => shortDate(new Date(iso), store);
  const user = await readUser();
  const client = await db();

  const [devices, tradeIns] = await Promise.all([
    listExchangeDevices(client, store.id),
    user ? listTradeIns(client, store.id).catch(() => [] as TradeIn[]) : ([] as TradeIn[]),
  ]);
  const device = devices.find((d) => d.id === sp.device) ?? null;
  const condition = isExchangeCondition(sp.condition) ? sp.condition : null;
  const quote = device && condition ? tradeInValue(device.valueMinor, condition) : null;
  // the quote form was sent, and one of its fields isn't right
  const fieldError = !sp.error && (sp.device != null || sp.condition != null) ? (!device ? 'device' : !condition ? 'condition' : null) : null;
  const error = sp.error && ERROR[sp.error] ? sp.error : fieldError;
  const done = sp.done ? tradeIns.find((t) => t.id === sp.done) : undefined;
  const top = devices.reduce((best, d) => Math.max(best, d.valueMinor), 0);
  const byKind = (['phone', 'laptop'] as const)
    .map((k) => ({ kind: k, devices: devices.filter((d) => d.kind === k) }))
    .filter((g) => g.devices.length);

  return (
    <AppShell>
      <Page>
        <PageHead kicker="Trade-In" title="Trade in your old phone or laptop">
          Get a quote in seconds, send it free, and get {top ? `up to ${money(top)}` : 'its value'} as gift card credit on your balance once we’ve checked it.
        </PageHead>

        {done ? (
          <Alert tone="success">
            Your {done.device} is traded in for {money(done.quoteMinor)}. Send it by {date(done.shipBy)} with label code {done.shipCode}; we’ll add the credit to your balance once we’ve checked it.
          </Alert>
        ) : null}
        {sp.cancelled ? <Alert tone="success">Trade-in cancelled. Nothing more to do.</Alert> : null}
        {error === 'closed' ? <Alert tone="error">{ERROR.closed}</Alert> : null}

        <Section title="How it works">
          <div className="grid gap-3.5 sm:grid-cols-3">
            <InfoCard index="Step 1" title="Get a quote">Pick your model and tell us what state it’s in.</InfoCard>
            <InfoCard index="Step 2" title="Send it free">Pack it and send it within {TRADE_IN_SHIP_DAYS} days with the prepaid label.</InfoCard>
            <InfoCard index="Step 3" title="Get credit">Once we’ve checked it, the value goes on your balance to spend on anything in the store.</InfoCard>
          </div>
        </Section>

        <Section id="quote" title="Get a quote" className="scroll-mt-28">
          <Card>
            <form method="get" action={path('/trade-in')} className="flex max-w-[640px] flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
                Model
                <select name="device" defaultValue={device?.id ?? ''} aria-invalid={error === 'device' || undefined} className={selectClass}>
                  <option value="" disabled>Choose your model</option>
                  {byKind.map((g) => (
                    <optgroup key={g.kind} label={KIND_HEADING[g.kind]}>
                      {g.devices.map((d: ExchangeDevice) => (
                        <option key={d.id} value={d.id}>{d.brand} {d.model} — up to {money(d.valueMinor)}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-2 text-[14px] font-semibold">What state is it in?</legend>
                {EXCHANGE_CONDITIONS.map((c) => (
                  <label key={c} className={payChoice}>
                    <input type="radio" name="condition" value={c} defaultChecked={(condition ?? 'good') === c} className={payRadio} />
                    <span className="flex flex-col gap-0.5">
                      <span>{CONDITION_LABEL[c]}</span>
                      {c === 'screen_damaged' ? <span className="text-[13px] text-ink-3">Half the value</span> : null}
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className="m-0 text-[13px] text-ink-3">It must switch on and hold a charge, with any lock (like Find My) turned off and your data erased.</p>
              <div>
                <button type="submit" className={buttonClasses({ variant: 'dark' })}>See your quote</button>
              </div>
            </form>
            {error && error !== 'closed' && !quote ? <p role="alert" className="m-0 mt-3 text-[14px] text-bad">{ERROR[error]}</p> : null}
          </Card>

          {device && condition && quote ? (
            <Card className="flex flex-col gap-3">
              <span className="text-[14px] text-ink-2">{device.brand} {device.model} · {CONDITION_LABEL[condition]}</span>
              <span className="text-[28px] font-bold tabular-nums leading-none">{money(quote)}</span>
              <span className="text-[14px] text-ink-2">
                in gift card credit. If it arrives in worse shape than you said, we’ll pay what it’s worth as it came.
              </span>
              {error ? <Alert tone="error">{ERROR[error]}</Alert> : null}
              {user ? (
                <form action={requestTradeInAction}>
                  <input type="hidden" name="device" value={device.id} />
                  <input type="hidden" name="condition" value={condition} />
                  <SubmitButton variant="primary" size="lg">Trade in for {money(quote)}</SubmitButton>
                </form>
              ) : (
                <a
                  href={signInPath(store, `/trade-in?${new URLSearchParams({ device: device.id, condition }).toString()}#quote`)}
                  className={`${buttonClasses({ variant: 'primary', size: 'lg' })} self-start`}
                >
                  Sign in to trade in
                </a>
              )}
            </Card>
          ) : null}
        </Section>

        {tradeIns.length ? (
          <Section id="yours" title="Your trade-ins" className="scroll-mt-28">
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {tradeIns.map((t) => (
                <Card key={t.id} as="li" className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <strong className="text-[16px] font-semibold">{t.device}</strong>
                      <span className="text-[13px] text-ink-3">{CONDITION_LABEL[t.condition]} · traded in {date(t.createdAt)}</span>
                    </span>
                    <StatusChip label={TRADE_IN_STATUS_LABEL[t.status]} tone={TONE[t.status]} />
                  </div>
                  <TradeInFacts t={t} money={money} date={date} />
                  {t.status === 'open' ? (
                    <div>
                      <ConfirmAction
                        action={cancelTradeInAction.bind(null, t.id)}
                        label="Cancel trade-in"
                        prompt={<>Cancel this trade-in? Don’t send the {t.device}.</>}
                        confirmLabel="Yes, cancel"
                        pendingLabel="Cancelling…"
                        cancelLabel="Keep it"
                      />
                    </div>
                  ) : null}
                </Card>
              ))}
            </ul>
          </Section>
        ) : null}

        <TextLink href={path('/gift-cards#balance')}>See your balance</TextLink>
        <DemoNote>
          Demo store — the values are examples; nothing is shipped and no label is printed. The credit goes on your store balance when a store admin marks the device received.
        </DemoNote>
      </Page>
    </AppShell>
  );
}

/** A trade-in's money and shipping, by where it is. */
function TradeInFacts({ t, money, date }: { t: TradeIn; money: (minor: number) => string; date: (iso: string) => string }) {
  const row = (label: string, value: string, mono = false) => (
    <div className="flex flex-col">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className={`m-0 ${mono ? 'font-mono tracking-[0.06em]' : 'tabular-nums'}`}>{value}</dd>
    </div>
  );
  return (
    <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-5 gap-y-2 text-[14px]">
      {t.status === 'credited' && t.creditedMinor != null ? (
        <>
          {row('Credited to your balance', money(t.creditedMinor))}
          {t.creditedMinor < t.quoteMinor && t.receivedCondition ? row('We found', `${CONDITION_LABEL[t.receivedCondition]} (quote ${money(t.quoteMinor)})`) : null}
          {t.closedAt ? row('Credited on', date(t.closedAt)) : null}
        </>
      ) : (
        row(t.status === 'open' ? 'Quote' : 'Quoted', money(t.quoteMinor))
      )}
      {t.status === 'open' ? (
        <>
          {row('Send by', date(t.shipBy))}
          {row('Label code', t.shipCode, true)}
        </>
      ) : null}
      {t.status === 'rejected' ? row('Sent back', t.rejectNote ?? 'It wasn’t the model you picked, or it didn’t switch on.') : null}
      {t.status === 'cancelled' && t.closedAt ? row('Cancelled on', date(t.closedAt)) : null}
    </dl>
  );
}
