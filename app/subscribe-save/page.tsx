import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cancelSubscriptionAction, skipSubscriptionAction, updateSubscriptionAction } from '@/app/actions/subscribe-save';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/decision';
import { longDate } from '@/components/orders/format';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { Select } from '@/components/primitives/Select';
import { addressLine } from '@/components/subscribe-save/parts';
import { readUser } from '@/lib/auth';
import { listAddresses } from '@/lib/data/addresses';
import { getProducts } from '@/lib/data/catalog';
import { messageFor } from '@/lib/data/errors';
import { listSubscriptions, subscribeMethods } from '@/lib/data/subscriptions';
import { toStoreMinor } from '@/lib/fx';
import { storePath } from '@/lib/marketplace';
import { getMarketplace } from '@/lib/marketplace-server';
import { formatMoney } from '@/lib/marketplaces';
import {
  deliveries,
  frequencyLabel,
  issueText,
  SNS_FREQUENCIES,
  SNS_MANY,
  SNS_MAX_QTY,
  SNS_METHOD_LABEL,
  SNS_PCT_MANY,
  snsShortfall,
  snsUnitMinor,
  storeDay,
} from '@/lib/subscribe-save';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Subscribe & Save · Store' };

const PAGE = '/subscribe-save';

const DONE: Record<string, string> = {
  updated: 'Your subscription has been changed.',
  skipped: 'Done: that delivery is skipped. The one after it is next.',
  cancelled: 'Your subscription is cancelled. Orders already placed aren’t affected.',
};

/**
 * /subscribe-save, Amazon's "Manage your Subscribe & Save": the shopper's upcoming deliveries in
 * this store, soonest first, each with what it saves (more when 5 or more arrive together) and its
 * subscriptions, each of which can be skipped, changed (how many, how often, where to, how paid)
 * or cancelled. Why a delivery didn't go shows on its subscriptions until the next one does.
 */
export default async function SubscribeSavePage({ searchParams }: { searchParams: Promise<{ updated?: string; skipped?: string; cancelled?: string; error?: string }> }) {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const user = await readUser();
  if (!user) redirect(sp(`/signin?next=${PAGE}`));
  const q = await searchParams;
  const client = await db();
  const [subs, addresses, methods] = await Promise.all([listSubscriptions(client, store.id), listAddresses(client, store.id), subscribeMethods(client, store.id)]);
  const products = new Map((await getProducts(client, [...new Set(subs.map((s) => s.productId))], { includeArchived: true })).map((p) => [p.id, p]));
  const cur = store.currency.code;
  const money = (minor: number) => formatMoney(minor, cur);
  const addressById = new Map(addresses.map((a) => [a.id, a]));
  const done = (['updated', 'skipped', 'cancelled'] as const).find((k) => q[k] === '1');
  const error = q.error ? (messageFor(q.error) ?? 'We couldn’t change that. Please try again.') : null;
  const plan = deliveries(subs);

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-col gap-1.5">
          <a href={sp('/account')} className="self-start text-[14px] text-ink underline underline-offset-2">← Account</a>
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Subscribe &amp; Save</h1>
          <span className="text-[15px] text-ink-2">
            Your upcoming deliveries. Each one is free to deliver, and saves {SNS_PCT_MANY}% when {SNS_MANY} or more subscriptions arrive together.
          </span>
        </div>

        {done ? <Alert tone="success">{DONE[done]}</Alert> : null}
        {error ? <Alert tone="error">{error}</Alert> : null}

        {!plan.length ? (
          <EmptyState title="You don’t have any subscriptions" action={<a href={sp('/s?dept=beauty')} className={buttonClasses({ variant: 'secondary' })}>Shop Beauty</a>}>
            Choose “Set Up Now” under Subscribe &amp; Save on a product you run out of to have it delivered every few months, for less.
          </EmptyState>
        ) : null}

        {plan.map((d) => {
          const address = d.addressId ? addressById.get(d.addressId) : undefined;
          const short = snsShortfall(d);
          return (
            <section key={`${d.on}|${d.addressId ?? ''}|${d.paymentMethod}`} aria-label={`Delivery on ${longDate(storeDay(d.on), store)}`} className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-[18px]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="m-0 text-[18px] font-semibold">{longDate(storeDay(d.on), store)}</h2>
                <span className="text-[14px] font-semibold text-good-strong">Saving {d.pct}%</span>
              </div>
              <span className="text-[13px] text-ink-2">
                {address ? `To ${address.name}, ${addressLine(address)}` : 'No address: choose one below'} · {SNS_METHOD_LABEL[d.paymentMethod] ?? d.paymentMethod}
                {short ? ` · ${short} more subscription${short === 1 ? '' : 's'} in this delivery would save ${SNS_PCT_MANY}%` : ''}
              </span>
              <ul className="m-0 flex list-none flex-col p-0">
                {d.subscriptions.map((s) => {
                  const p = products.get(s.productId);
                  const priceMinor = p ? toStoreMinor(p.priceMinor, cur, p.curBase) : 0;
                  const title = p?.title ?? 'This item';
                  return (
                    <li key={s.id} id={`sub-${s.id}`} className="flex flex-col gap-3 border-t border-line-2 py-4 first:border-t-0 first:pt-1">
                      <div className="flex gap-3.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {p ? <img src={p.image} alt="" className="h-20 w-20 flex-none rounded-input object-contain" /> : null}
                        <div className="flex min-w-0 flex-1 flex-col gap-1 text-[14px]">
                          {p ? <a href={sp(`/product/${encodeURIComponent(p.id)}`)} className="font-semibold text-ink no-underline hover:underline">{title}</a> : <strong className="font-semibold">{title}</strong>}
                          {p ? (
                            <span className="tabular-nums">
                              {s.qty} × {money(priceMinor - snsUnitMinor(priceMinor, d.pct))} <s className="text-ink-3">{money(priceMinor)}</s>
                            </span>
                          ) : null}
                          <span className="text-ink-2">{frequencyLabel(s.everyMonths)}</span>
                        </div>
                      </div>
                      {s.issue ? <Alert tone="warning">{issueText(s.issue.kind)}</Alert> : null}
                      <div className="flex flex-wrap items-center gap-2.5">
                        <form action={skipSubscriptionAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <button type="submit" aria-label={`Skip this delivery: ${title}`} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Skip this delivery</button>
                        </form>
                        <form action={cancelSubscriptionAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <button type="submit" aria-label={`Cancel subscription: ${title}`} className={buttonClasses({ variant: 'link', size: 'sm' })}>Cancel subscription</button>
                        </form>
                      </div>
                      <details className="text-[14px]">
                        <summary className="cursor-pointer font-semibold">Change quantity, frequency, address or payment</summary>
                        <form action={updateSubscriptionAction} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <input type="hidden" name="id" value={s.id} />
                          <Select label="Quantity" name="qty" defaultValue={String(s.qty)} options={Array.from({ length: SNS_MAX_QTY }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
                          <Select label="Deliver every" name="every" defaultValue={String(s.everyMonths)} options={SNS_FREQUENCIES.map((m) => ({ value: String(m), label: m === 1 ? '1 month' : `${m} months` }))} />
                          <Select
                            label="Deliver to"
                            name="address"
                            defaultValue={s.addressId ?? ''}
                            options={[...(s.addressId ? [] : [{ value: '', label: 'Choose an address' }]), ...addresses.map((a) => ({ value: a.id, label: `${a.name}, ${a.line1}` }))]}
                          />
                          <Select label="Pay with" name="method" defaultValue={s.paymentMethod} options={methods.map((m) => ({ value: m, label: SNS_METHOD_LABEL[m] ?? m }))} />
                          <button type="submit" className={`${buttonClasses({ variant: 'primary', size: 'sm' })} col-span-full justify-self-start`}>Save changes</button>
                        </form>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
