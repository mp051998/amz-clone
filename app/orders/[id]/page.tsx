import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ProductFrame } from '@/components/decision';
import { buttonClasses } from '@/components/primitives/Button';
import { EtaPanel, FactsCard, Timeline } from '@/components/orders/Tracking';
import { dayLabel, orderView, paymentText } from '@/components/orders/format';
import { firstName, readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { getOrder } from '@/lib/data/orders';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import type { Order } from '@/lib/types';

export const metadata: Metadata = { title: 'Your order · Store' };

/** Orders placed this recently count as "just placed" even without ?placed=1 (e.g. a refresh). */
const JUST_PLACED_MS = 10 * 60_000;

function addressLine(o: Order): string {
  const s = o.shipTo;
  return [s.name, s.line1, s.line2, `${s.city} ${s.postcode}`].filter(Boolean).join(', ');
}

function paidWith(o: Order): string {
  const label = paymentText(o.paymentMethod, o.paymentLabel);
  if (o.status === 'awaiting_payment') return `${label} · not paid yet`;
  if (o.status === 'cancelled') return `${label} · not charged`;
  return label;
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const { id } = await params;
  const { placed } = await searchParams;
  const store = await getMarketplace();
  const user = await readUser();
  if (!user) redirect(storePath(store, `/signin?next=${encodeURIComponent(`/orders/${id}`)}`));
  const order = await getOrder(await db(), id);
  if (!order) notFound();
  if (order.market !== store.id) redirect(storePath({ id: order.market }, `/orders/${encodeURIComponent(order.id)}`));

  const now = new Date();
  const money = (minor: number) => formatMoney(minor, order.currency);
  const sp = (path: string) => storePath(store, path);
  const view = orderView(order, store, now);
  const countText = `${view.itemCount} ${view.itemCount === 1 ? 'item' : 'items'}`;
  const placedAt = Date.parse(order.placedAt ?? order.createdAt);
  const confirming = order.status === 'placed' && (placed === '1' || now.getTime() - placedAt < JUST_PLACED_MS) && placed !== '0';

  if (confirming) {
    return (
      <AppShell>
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-[clamp(16px,3vw,24px)] pb-[120px] pt-14">
          <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full bg-good-dot text-[28px] font-bold text-white">✓</span>
          <h1 className="m-0 text-[clamp(28px,4vw,38px)] font-semibold tracking-[-0.02em]">Order placed, thanks {firstName(user)}.</h1>
          <div className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-5">
            <span className="text-[13px] text-ink-3">Arriving</span>
            <strong className="text-[24px] font-semibold">{view.eta ? dayLabel(view.eta, store, now) : 'Soon'}</strong>
            <span className="text-[15px] text-ink-2">{addressLine(order)}</span>
            <div className="mt-2 flex flex-wrap justify-between gap-1.5 border-t border-line-2 pt-3 text-[14px]">
              <span>Order <span className="font-mono">{order.id}</span></span>
              <strong className="tabular-nums">{money(order.totals.totalMinor)} · {countText}</strong>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <a href={sp(`/orders/${order.id}?placed=0`)} className={buttonClasses({ variant: 'primary', size: 'lg' })}>Track order</a>
            <a href={sp('/')} className={buttonClasses({ variant: 'secondary', size: 'lg' })}>Continue shopping</a>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[820px] flex-col gap-5 px-[clamp(16px,3vw,24px)] pb-[120px] pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="m-0 text-[14px] font-normal text-ink-2">
            Your order · <span className="font-mono text-ink">{order.id}</span>
          </h1>
          <a href={sp('/orders')} className="text-[14px] text-ink underline underline-offset-2">All orders</a>
        </div>

        <EtaPanel kicker={view.kicker} headline={view.headline} window={view.window} />

        <section className="flex flex-col rounded-panel border border-line bg-surface p-[22px]" aria-labelledby="progress-h">
          <h2 id="progress-h" className="m-0 mb-3.5 text-[18px] font-semibold">Delivery progress</h2>
          <Timeline steps={view.steps} store={store} now={now} />
        </section>

        <FactsCard
          rows={[
            { label: 'Items', value: order.items.map((i) => `${i.title}${i.qty > 1 ? ` × ${i.qty}` : ''}`).join(', ') },
            { label: 'Deliver to', value: addressLine(order) },
            { label: 'Paid with', value: paidWith(order) },
            { label: 'Total', value: <span className="tabular-nums">{money(order.totals.totalMinor)}</span>, strong: true },
          ]}
        />

        <section className="overflow-hidden rounded-panel border border-line bg-surface" aria-labelledby="items-h">
          <h2 id="items-h" className="m-0 px-[18px] pb-1 pt-4 text-[16px] font-semibold">{countText}</h2>
          {order.items.map((it) => (
            <div key={it.productId} className="flex flex-wrap items-center gap-3.5 border-t border-line-2 px-[18px] py-3.5 first-of-type:border-t-0">
              <a href={sp(`/product/${it.productId}`)} className="w-16 flex-none" tabIndex={-1} aria-hidden>
                <ProductFrame src={it.image} alt="" aspect="1/1" />
              </a>
              <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
                <a href={sp(`/product/${it.productId}`)} className="line-clamp-2 text-[15px] font-semibold text-ink no-underline">{it.title}</a>
                <span className="text-[13px] text-ink-3">Qty {it.qty} · Sold by {it.seller}</span>
              </div>
              <strong className="tabular-nums">{money(it.unitPriceMinor * it.qty)}</strong>
            </div>
          ))}
          <dl className="m-0 flex flex-col gap-1 border-t border-line-2 px-[18px] py-3.5 text-[14px]">
            <div className="flex justify-between"><dt className="text-ink-2">Items</dt><dd className="m-0 tabular-nums">{money(order.totals.subtotalMinor)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Delivery</dt><dd className="m-0 tabular-nums">{order.totals.shipMinor === 0 ? 'FREE' : money(order.totals.shipMinor)}</dd></div>
            {order.totals.taxMinor > 0 ? (
              <div className="flex justify-between"><dt className="text-ink-2">Tax</dt><dd className="m-0 tabular-nums">{money(order.totals.taxMinor)}</dd></div>
            ) : (
              <div className="flex justify-between"><dt className="text-ink-2">Tax</dt><dd className="m-0 text-ink-3">{store.pricing.taxNote ?? 'Inclusive of all taxes'}</dd></div>
            )}
          </dl>
        </section>

        <div className="flex flex-wrap gap-2.5">
          <a href={sp('/orders')} className={buttonClasses({ variant: 'secondary' })}>View all orders</a>
          <a href={sp('/')} className={buttonClasses({ variant: 'secondary' })}>Continue shopping</a>
        </div>
      </div>
    </AppShell>
  );
}
