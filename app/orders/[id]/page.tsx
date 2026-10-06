import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ProductFrame } from '@/components/decision';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { EtaPanel, FactsCard, Timeline } from '@/components/orders/Tracking';
import { dayLabel, lcFirst, longDate, orderView, paidWithText, stepTime } from '@/components/orders/format';
import { cancelMyOrder } from '@/app/actions/order';
import { cancelMyReturn } from '@/app/actions/returns';
import { BuyAgainButton } from '@/components/orders/BuyAgainButton';
import { PairsWith } from '@/components/cart/PairsWith';
import { refundTo, ReturnCard } from '@/components/orders/Returns';
import { canStartReturn, getOrderReturns } from '@/lib/data/returns';
import { messageFor } from '@/lib/data/errors';
import { firstName, readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { getOrder } from '@/lib/data/orders';
import { getProducts } from '@/lib/data/catalog';
import { availabilityOf } from '@/lib/buy-again';
import { accessoriesFor, type Accessory } from '@/lib/decision/server';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import type { Db } from '@/lib/db/client';
import type { Order } from '@/lib/types';

export const metadata: Metadata = { title: 'Your order · Store' };

/** Orders placed this recently count as "just placed" even without ?placed=1 (e.g. a refresh). */
const JUST_PLACED_MS = 10 * 60_000;

function addressLine(o: Order): string {
  const s = o.shipTo;
  return [s.name, s.line1, s.line2, `${s.city} ${s.postcode}`].filter(Boolean).join(', ');
}

/** The gift row: the note as written (line breaks kept), or that there is none. */
function giftText(gift: NonNullable<Order['gift']>) {
  return gift.message ? <span className="whitespace-pre-line">“{gift.message}”</span> : 'Yes, no message';
}

/** Add-ons for what was just ordered (the thank-you page's "goes with your order" row); never an error. */
async function pairsFor(client: Db, o: Order): Promise<Accessory[]> {
  try {
    const bought = await getProducts(client, o.items.map((i) => i.productId));
    return await accessoriesFor(bought.filter((p) => p.market === o.market), 4, client);
  } catch {
    return [];
  }
}

/** What cancelling does with the money, for the confirm step. */
function refundPromise(o: Order, total: string): string {
  if (o.paymentMethod === 'cod') return 'Nothing has been charged yet.';
  if (o.paymentMethod === 'card') return `We’ll refund ${total} to your card.`;
  return `${total} goes back to ${refundTo(o.paymentMethod, o.paymentLabel)}.`;
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string; cancelled?: string; error?: string; return?: string }>;
}) {
  const { id } = await params;
  const { placed, cancelled, error, return: returned } = await searchParams;
  const store = await getMarketplace();
  const user = await readUser();
  if (!user) redirect(storePath(store, `/signin?next=${encodeURIComponent(`/orders/${id}`)}`));
  const client = await db();
  const order = await getOrder(client, id);
  if (!order) notFound();
  if (order.market !== store.id) redirect(storePath({ id: order.market }, `/orders/${encodeURIComponent(order.id)}`));

  const now = new Date();
  const money = (minor: number) => formatMoney(minor, order.currency);
  const sp = (path: string) => storePath(store, path);
  const view = orderView(order, store, now);
  const countText = `${view.itemCount} ${view.itemCount === 1 ? 'item' : 'items'}`;
  const placedAt = Date.parse(order.placedAt ?? order.createdAt);
  const confirming = order.status === 'placed' && (placed === '1' || now.getTime() - placedAt < JUST_PLACED_MS) && placed !== '0';
  const [returns, current] = confirming
    ? [null, []]
    : await Promise.all([getOrderReturns(client, order.id), getProducts(client, order.items.map((i) => i.productId), { includeArchived: true }).catch(() => [])]);
  const nowById = new Map(current.map((p) => [p.id, p]));
  const returnBy = returns?.returnBy ? new Date(returns.returnBy) : null;

  if (confirming) {
    const pairs = await pairsFor(client, order);
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
          <PairsWith items={pairs} store={store} id="pairs-h" title="Goes with your order" note="Adds to your cart, not this order" />
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
          <div className="flex flex-wrap items-baseline gap-4">
            {order.status === 'awaiting_payment' ? null : (
              <a href={sp(`/orders/${encodeURIComponent(order.id)}/invoice`)} className="text-[14px] text-ink underline underline-offset-2">
                {order.status === 'cancelled' ? 'Order summary' : 'Invoice'}
              </a>
            )}
            <a href={sp('/orders')} className="text-[14px] text-ink underline underline-offset-2">All orders</a>
          </div>
        </div>

        {error ? (
          <Alert tone="error">{messageFor(error) ?? 'Something went wrong. Please try again.'}</Alert>
        ) : cancelled === '1' && order.status === 'cancelled' ? (
          <Alert tone="success">Your order is cancelled.</Alert>
        ) : returned === 'started' ? (
          <Alert tone="success">Return started. Drop the items off with the code below.</Alert>
        ) : returned === 'cancelled' ? (
          <Alert tone="success">Your return is cancelled.</Alert>
        ) : null}

        <EtaPanel kicker={view.kicker} headline={view.headline} window={view.window} />

        <section className="flex flex-col rounded-panel border border-line bg-surface p-[22px]" aria-labelledby="progress-h">
          <h2 id="progress-h" className="m-0 mb-3.5 text-[18px] font-semibold">Delivery progress</h2>
          <Timeline steps={view.steps} store={store} now={now} />
        </section>

        <FactsCard
          rows={[
            { label: 'Items', value: order.items.map((i) => `${i.title}${i.qty > 1 ? ` × ${i.qty}` : ''}`).join(', ') },
            { label: 'Deliver to', value: addressLine(order) },
            ...(order.shipSpeed === 'fast' ? [{ label: 'Delivery', value: 'Faster delivery' }] : []),
            ...(order.gift ? [{ label: 'Gift', value: giftText(order.gift) }] : []),
            { label: 'Paid with', value: paidWithText(order) },
            { label: 'Total', value: <span className="tabular-nums">{money(order.totals.totalMinor)}</span>, strong: true },
          ]}
        />

        {view.cancelUntil ? (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-[18px] py-4" aria-label="Cancel order">
            <p className="m-0 text-[14px] text-ink-2">
              Changed your mind? You can cancel until it ships, {lcFirst(stepTime(view.cancelUntil, store, now))}.
            </p>
            <ConfirmAction
              action={cancelMyOrder.bind(null, order.id)}
              label="Cancel order"
              prompt={<>Cancel this order? {refundPromise(order, money(order.totals.totalMinor))}</>}
              confirmLabel="Yes, cancel it"
              pendingLabel="Cancelling…"
              cancelLabel="Keep order"
            />
          </section>
        ) : null}

        {returns && returnBy ? (
          <section className="flex flex-col gap-3" aria-labelledby="returns-h">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-[18px] py-4">
              <div className="flex flex-col gap-0.5">
                <h2 id="returns-h" className="m-0 text-[16px] font-semibold">Returns</h2>
                <p className="m-0 text-[14px] text-ink-2">
                  {canStartReturn(returns, now)
                    ? `Eligible for return until ${longDate(returnBy, store)}.`
                    : returnBy.getTime() < now.getTime()
                      ? `The return window closed on ${longDate(returnBy, store)}.`
                      : 'Every item in this order is being returned.'}
                </p>
              </div>
              {canStartReturn(returns, now) ? (
                <a href={sp(`/orders/${encodeURIComponent(order.id)}/return`)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Return items</a>
              ) : null}
            </div>
            {returns.returns.map((r) => (
              <ReturnCard
                key={r.id}
                r={r}
                currency={order.currency}
                method={order.paymentMethod}
                label={order.paymentLabel}
                store={store}
                cancel={r.status === 'requested' ? cancelMyReturn.bind(null, order.id, r.id) : undefined}
              />
            ))}
          </section>
        ) : null}

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
                {it.unitDiscountMinor ? <span className="text-[13px] font-semibold text-good-strong">Coupon −{money(it.unitDiscountMinor * it.qty)}</span> : null}
                {order.deliveredAt && order.status !== 'cancelled' ? (
                  <a href={sp(`/product/${encodeURIComponent(it.productId)}#write-review`)} className="self-start text-[13px] text-ink underline underline-offset-2" aria-label={`Write a product review: ${it.title}`}>
                    Write a product review
                  </a>
                ) : null}
              </div>
              <div className="flex flex-none flex-col items-end gap-1.5">
                <strong className="tabular-nums">{money(it.unitPriceMinor * it.qty)}</strong>
                {order.status === 'awaiting_payment' ? null : availabilityOf(nowById.get(it.productId)) === 'available' ? (
                  <BuyAgainButton productId={it.productId} title={it.title} />
                ) : (
                  <span className="text-[12px] text-ink-3">Currently unavailable</span>
                )}
              </div>
            </div>
          ))}
          <dl className="m-0 flex flex-col gap-1 border-t border-line-2 px-[18px] py-3.5 text-[14px]">
            <div className="flex justify-between"><dt className="text-ink-2">Items</dt><dd className="m-0 tabular-nums">{money(order.totals.subtotalMinor)}</dd></div>
            {order.totals.discountMinor ? (
              <div className="flex justify-between"><dt className="text-ink-2">Coupon savings</dt><dd className="m-0 tabular-nums">−{money(order.totals.discountMinor)}</dd></div>
            ) : null}
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
