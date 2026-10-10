import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { subscribeAction } from '@/app/actions/subscribe-save';
import { AppShell } from '@/components/AppShell';
import { Alert } from '@/components/primitives/Alert';
import { Select } from '@/components/primitives/Select';
import { AddressChoices, MethodChoices } from '@/components/subscribe-save/parts';
import { readUser } from '@/lib/auth';
import { listAddresses } from '@/lib/data/addresses';
import { isBalanceMethod, storeBalance } from '@/lib/data/balance';
import { getProduct } from '@/lib/data/catalog';
import { messageFor } from '@/lib/data/errors';
import { subscribeMethods, subscriptionFor } from '@/lib/data/subscriptions';
import { toStoreMinor } from '@/lib/fx';
import { storePath } from '@/lib/marketplace';
import { getMarketplace } from '@/lib/marketplace-server';
import { formatMoney } from '@/lib/marketplaces';
import { frequencyLabel, SNS_FREQUENCIES, SNS_MAX_QTY, SNS_PCT, snsUnitMinor } from '@/lib/subscribe-save';
import { db } from '@/lib/supabase/server';
import type { PaymentMethod } from '@/lib/types';
import { SubmitButton } from '@/components/primitives/SubmitButton';

export const metadata: Metadata = { title: 'Set up Subscribe & Save · Store' };

/** What the set-up page says for a refusal the generic copy doesn't fit. */
const ERRORS: Record<string, string> = {
  insufficient_stock: 'There isn’t enough of this in stock for that many right now. Choose fewer, or try again later.',
  insufficient_balance: 'Your balance doesn’t cover the first delivery. Add to your balance or choose another way to pay.',
  invalid_input: 'Choose 1 to 10 a delivery, every 1 to 6 months.',
};

const clamp = (v: string | undefined, max: number) => Math.min(max, Math.max(1, Number.parseInt(v ?? '', 10) || 1));

/**
 * /subscribe-save/new, after "Set Up Now" on a product: how many and how often (as chosen on the
 * product page, changeable here), where it goes and how it's paid, and what the first delivery
 * costs. Subscribing places that delivery now and goes on to its order.
 */
export default async function SubscribeSetupPage({ searchParams }: { searchParams: Promise<{ product?: string; qty?: string; every?: string; error?: string }> }) {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const q = await searchParams;
  const productId = q.product ?? '';
  const qty = clamp(q.qty, SNS_MAX_QTY);
  const every = clamp(q.every, SNS_FREQUENCIES.length);
  const user = await readUser();
  if (!user) redirect(sp(`/signin?next=${encodeURIComponent(`/subscribe-save/new?product=${encodeURIComponent(productId)}&qty=${qty}&every=${every}`)}`));

  const client = await db();
  const [p, addresses, methods, existing, balance] = await Promise.all([
    productId ? getProduct(client, productId) : Promise.resolve(null),
    listAddresses(client, store.id),
    subscribeMethods(client, store.id),
    productId ? subscriptionFor(client, productId) : Promise.resolve(null),
    storeBalance(client, store.id),
  ]);
  const cur = store.currency.code;
  const money = (minor: number) => formatMoney(minor, cur);
  const error = q.error ? (ERRORS[q.error] ?? messageFor(q.error) ?? 'We couldn’t set that up. Please try again.') : null;

  const shell = (body: ReactNode) => (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-col gap-1.5">
          {p ? <a href={sp(`/product/${encodeURIComponent(p.id)}`)} className="self-start text-[14px] text-ink underline underline-offset-2">← Back to the product</a> : null}
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Set up Subscribe &amp; Save</h1>
        </div>
        {body}
      </div>
    </AppShell>
  );

  if (!p || p.market !== store.id || !p.subscribeSave) {
    return shell(<Alert tone="info">This item isn’t available with Subscribe &amp; Save. <a href={sp('/subscribe-save')} className="text-ink underline">Your subscriptions</a></Alert>);
  }
  if (existing) {
    return shell(
      <Alert tone="info">
        You’re already subscribed to {p.title}. <a href={sp(`/subscribe-save#sub-${existing.id}`)} className="text-ink underline">Change it on your Subscribe &amp; Save page</a>
      </Alert>,
    );
  }

  const priceMinor = toStoreMinor(p.priceMinor, cur, p.curBase);
  const offMinor = snsUnitMinor(priceMinor, SNS_PCT) * qty;
  const chosenAddress = addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id;
  const notes: Partial<Record<PaymentMethod, string>> = {};
  for (const m of methods) {
    if (isBalanceMethod(m)) notes[m] = balance == null ? 'Paid from your balance' : `Balance: ${money(balance)}`;
    else notes[m] = 'Settled when each delivery is placed';
  }

  return shell(
    <>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <form action={subscribeAction} className="flex flex-col gap-6">
        <input type="hidden" name="product" value={p.id} />
        <section aria-label="Item" className="flex gap-4 rounded-panel border border-line bg-surface p-[18px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.image} alt="" className="h-24 w-24 flex-none rounded-input object-contain" />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <strong className="text-[15px] font-semibold">{p.title}</strong>
            <span className="text-[14px] text-ink-2">
              {money(priceMinor - snsUnitMinor(priceMinor, SNS_PCT))} each with Subscribe &amp; Save <s className="text-ink-3">{money(priceMinor)}</s>
            </span>
            <div className="grid max-w-[360px] grid-cols-2 gap-3">
              <Select label="Quantity" name="qty" defaultValue={String(qty)} options={Array.from({ length: SNS_MAX_QTY }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
              <Select label="Deliver every" name="every" defaultValue={String(every)} options={SNS_FREQUENCIES.map((m) => ({ value: String(m), label: m === 1 ? '1 month' : `${m} months` }))} />
            </div>
          </div>
        </section>

        <section aria-label="Delivery and payment" className="flex flex-col gap-5 rounded-panel border border-line bg-surface p-[18px]">
          {addresses.length ? (
            <AddressChoices addresses={addresses} chosen={chosenAddress} />
          ) : (
            <Alert tone="warning">
              Add an address to deliver your subscription to. <a href={sp('/account/addresses')} className="text-ink underline">Your addresses</a>
            </Alert>
          )}
          {methods.length ? <MethodChoices methods={methods} chosen={methods[0]} notes={notes} /> : null}
          <p className="m-0 text-[13px] text-ink-2">
            Deliveries are placed while you’re away, so they’re paid with what the store can charge by itself{store.id === 'US' ? ': your gift card balance' : ''}. Cards can’t be used for subscriptions.
          </p>
        </section>

        <section aria-label="First delivery" className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-[18px]">
          <h2 className="m-0 text-[16px] font-semibold">Your first delivery</h2>
          <dl className="m-0 flex flex-col gap-1 text-[14px]">
            <div className="flex justify-between"><dt className="text-ink-2">Items ({qty})</dt><dd className="m-0 tabular-nums">{money(priceMinor * qty)}</dd></div>
            <div className="flex justify-between text-good-strong"><dt>Subscribe &amp; Save ({SNS_PCT}%)</dt><dd className="m-0 tabular-nums">−{money(offMinor)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Delivery</dt><dd className="m-0">FREE</dd></div>
          </dl>
          <p className="m-0 text-[13px] text-ink-2">
            {store.pricing.taxInclusive ? 'Prices include tax.' : 'Tax is added when the order is placed.'} The first delivery is ordered now; after that, {frequencyLabel(every).toLowerCase()}. Skip, change or cancel any time on your Subscribe &amp; Save page.
          </p>
          <SubmitButton disabled={!addresses.length || !methods.length} variant="primary" size="lg">
            Subscribe and place first order
          </SubmitButton>
        </section>
      </form>
    </>,
  );
}
