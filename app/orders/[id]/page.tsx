import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ProductFrame } from '@/components/decision';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { EtaPanel, FactsCard, Timeline } from '@/components/orders/Tracking';
import { dayLabel, lcFirst, longDate, orderView, paidWithText, returnUntilText, stepTime } from '@/components/orders/format';
import { archiveMyOrder, cancelMyOrder, changeOrderAddress, payForOrder, rateDelivery, rateSeller, removeDeliveryRating, removeSellerRating, updateOrderInstructions } from '@/app/actions/order';
import { cancelMyReturn, reportMissing } from '@/app/actions/returns';
import { BuyAgainButton } from '@/components/orders/BuyAgainButton';
import { PairsWith } from '@/components/cart/PairsWith';
import { refundTo, ReturnCard } from '@/components/orders/Returns';
import { CancelledItems } from '@/components/orders/CancelledItems';
import { SellerFeedbackSection } from '@/components/orders/SellerFeedback';
import { DeliveryFeedbackSection } from '@/components/orders/DeliveryFeedback';
import { deliveryFeedbackFor, deliveryFeedbackOpen, deliveryFeedbackOpenUntil, type DeliveryFeedback } from '@/lib/data/delivery-feedback';
import { canStartReturn, getOrderReturns, reportMissingUntil, returnWindows } from '@/lib/data/returns';
import { InstructionsField } from '@/components/checkout/AddressFields';
import { deliveryOptions, orderStage } from '@/lib/decision/tracking';
import { messageFor } from '@/lib/data/errors';
import { firstName, readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { getOrder } from '@/lib/data/orders';
import { listAddresses } from '@/lib/data/addresses';
import { getProducts } from '@/lib/data/catalog';
import { reviewedProductIds } from '@/lib/data/reviews';
import { feedbackOpen, feedbackOpenUntil, orderFeedback, orderSellers, type SellerFeedback } from '@/lib/data/seller-feedback';
import { availabilityOf } from '@/lib/buy-again';
import { accessoriesFor, type Accessory } from '@/lib/decision/server';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import type { Db } from '@/lib/db/client';
import type { Address, Order } from '@/lib/types';
import { protectionPlanName } from '@/lib/protection';
import { emiText } from '@/lib/emi';

export const metadata: Metadata = { title: 'Your order · Store' };

/** Orders placed this recently count as "just placed" even without ?placed=1 (e.g. a refresh). */
const JUST_PLACED_MS = 10 * 60_000;

function addressLine(o: Order): string {
  const s = o.shipTo;
  return [s.name, s.line1, s.line2, `${s.city} ${s.postcode}`].filter(Boolean).join(', ');
}

/** Whether a saved address is where the order already goes (its note aside). */
function sameAddress(a: Address, s: Order['shipTo']): boolean {
  const eq = (x?: string, y?: string) => (x ?? '').trim().toLowerCase() === (y ?? '').trim().toLowerCase();
  return eq(a.name, s.name) && eq(a.phone, s.phone) && eq(a.line1, s.line1) && eq(a.line2, s.line2) && eq(a.landmark, s.landmark)
    && eq(a.city, s.city) && eq(a.state, s.state) && eq(a.zip, s.postcode);
}

/** The gift row: the note as written (line breaks kept), or that there is none. */
function giftText(gift: NonNullable<Order['gift']>) {
  const wrapped = gift.wrapped ? 'Gift-wrapped' : null;
  if (!gift.message) return wrapped ? `${wrapped}, no message` : 'Yes, no message';
  return (
    <>
      <span className="whitespace-pre-line">“{gift.message}”</span>
      {wrapped ? <span className="block text-ink-3">{wrapped}</span> : null}
    </>
  );
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
  searchParams: Promise<{ placed?: string; cancelled?: string; error?: string; return?: string; archived?: string; instructions?: string; address?: string; feedback?: string; delivery?: string }>;
}) {
  const { id } = await params;
  const { placed, cancelled, error, return: returned, archived, instructions, address, feedback, delivery } = await searchParams;
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
  const productIds = order.items.map((i) => i.productId);
  // the sellers can be rated once it arrives, for 90 days
  const feedbackUntil = feedbackOpenUntil(order, now);
  const noFeedback = new Map<string, SellerFeedback>();
  // the delivery can be rated for 30 days after it arrives
  const deliveryUntil = deliveryFeedbackOpenUntil(order, now);
  // the address can change until the order ships; delivery instructions until it's out for delivery
  const stage = orderStage(order, now, store.dates.timeZone);
  const addressOpen = stage === 'preparing';
  const instructionsOpen = stage === 'preparing' || stage === 'shipped';
  const [returns, current, reviewed, sellerFeedback, saved, deliveryFeedback] = confirming
    ? [null, [], new Set<string>(), noFeedback, [], null]
    : await Promise.all([
        getOrderReturns(client, order.id),
        getProducts(client, productIds, { includeArchived: true }).catch(() => []),
        view.delivered ? reviewedProductIds(client, user.id, productIds).catch(() => new Set<string>()) : new Set<string>(),
        feedbackUntil ? orderFeedback(client, order.id).catch(() => noFeedback) : noFeedback,
        addressOpen ? listAddresses(client, store.id).catch((): Address[] => []) : [],
        deliveryUntil ? deliveryFeedbackFor(client, order.id).catch((): DeliveryFeedback | null => null) : null,
      ]);
  const nowById = new Map(current.map((p) => [p.id, p]));
  const otherAddresses = saved.filter((a) => !sameAddress(a, order.shipTo));
  const returnBy = returns?.returnBy ? new Date(returns.returnBy) : null;
  const windows = returns ? returnWindows(returns, now) : null;
  const missingUntil = reportMissingUntil(order, returns, now);
  const reportedMissing = returns?.returns.some((r) => r.reason === 'not_received' && r.status !== 'cancelled') ?? false;
  // a missing package can be sent again when every item is still on sale and in stock
  const replaceMissing =
    missingUntil && order.items.every((i) => {
      const p = nowById.get(i.productId);
      return p != null && !p.archived && p.stock >= i.qty;
    })
      ? new Date(deliveryOptions(now, store.dates.timeZone).standard)
      : null;

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
            {order.status === 'placed' ? (
              <a href={sp(`/orders/${encodeURIComponent(order.id)}/gift-receipt`)} className="text-[14px] text-ink underline underline-offset-2">
                Gift receipt
              </a>
            ) : null}
            {order.status === 'awaiting_payment' ? null : (
              <form action={archiveMyOrder.bind(null, order.id, !order.archivedAt)}>
                <button type="submit" className="border-0 bg-transparent p-0 text-[14px] text-ink underline underline-offset-2">
                  {order.archivedAt ? 'Unarchive order' : 'Archive order'}
                </button>
              </form>
            )}
            <a href={sp('/orders')} className="text-[14px] text-ink underline underline-offset-2">All orders</a>
          </div>
        </div>

        {error ? (
          <Alert tone="error">{messageFor(error) ?? 'Something went wrong. Please try again.'}</Alert>
        ) : cancelled === '1' && order.status === 'cancelled' ? (
          <Alert tone="success">Your order is cancelled.</Alert>
        ) : cancelled === 'items' && order.cancellations?.length ? (
          <Alert tone="success">Items cancelled. The rest of your order is still on its way.</Alert>
        ) : returned === 'started' ? (
          <Alert tone="success">Return started. Drop the items off with the code below.</Alert>
        ) : returned === 'replacement' ? (
          <Alert tone="success">Your replacement is on its way. Drop the original items off with the code below.</Alert>
        ) : returned === 'cancelled' ? (
          <Alert tone="success">Your return is cancelled.</Alert>
        ) : returned === 'missing' && reportedMissing ? (
          <Alert tone="success">Sorry your order didn’t arrive. We’ve refunded it, as shown below.</Alert>
        ) : returned === 'missing-replacement' && reportedMissing ? (
          <Alert tone="success">Sorry your order didn’t arrive. We’re sending it again at no charge, as shown below.</Alert>
        ) : archived === '1' && order.archivedAt ? (
          <Alert tone="success">
            Order archived. It’s no longer in your order list; find it under{' '}
            <a href={sp('/orders?period=archived')} className="text-ink underline underline-offset-2">Archived orders</a>.
          </Alert>
        ) : archived === '0' && !order.archivedAt ? (
          <Alert tone="success">Order unarchived. It’s back in your order list.</Alert>
        ) : address === 'changed' ? (
          <Alert tone="success">Delivery address changed. We’ll deliver this order to {addressLine(order)}.</Alert>
        ) : instructions === 'saved' ? (
          <Alert tone="success">Delivery instructions updated for this order.</Alert>
        ) : instructions === 'cleared' ? (
          <Alert tone="success">Delivery instructions removed from this order.</Alert>
        ) : feedback === 'saved' ? (
          <Alert tone="success">Thanks, your seller feedback is saved.</Alert>
        ) : feedback === 'removed' ? (
          <Alert tone="success">Your seller feedback is removed.</Alert>
        ) : delivery === 'saved' ? (
          <Alert tone="success">Thanks, your delivery feedback is saved.</Alert>
        ) : delivery === 'removed' ? (
          <Alert tone="success">Your delivery feedback is removed.</Alert>
        ) : order.archivedAt ? (
          <Alert tone="info">This order is archived, so it isn’t in your order list. Unarchive it to bring it back.</Alert>
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
            ...(order.shipTo.instructions ? [{ label: 'Instructions', value: <span className="whitespace-pre-line">{order.shipTo.instructions}</span> }] : []),
            ...(order.shipSpeed === 'fast' ? [{ label: 'Delivery', value: 'Faster delivery' }] : []),
            ...(order.gift ? [{ label: 'Gift', value: giftText(order.gift) }] : []),
            ...(order.gst ? [{ label: 'GST invoice', value: <>{order.gst.name} · GSTIN <span className="font-mono">{order.gst.gstin}</span></> }] : []),
            { label: 'Paid with', value: paidWithText(order) },
            ...(order.emiMonths ? [{ label: 'EMI', value: emiText(order.totals.totalMinor, order.emiMonths, money) }] : []),
            { label: 'Total', value: <span className="tabular-nums">{money(order.totals.totalMinor)}</span>, strong: true },
          ]}
        />

        {addressOpen ? (
          <details className="rounded-panel border border-line bg-surface px-[18px] py-3.5" open={error === 'address_not_found' || undefined}>
            <summary className="cursor-pointer text-[15px] font-semibold text-ink">Change delivery address</summary>
            {otherAddresses.length ? (
              <form action={changeOrderAddress.bind(null, order.id)} className="mt-3 flex flex-col gap-3">
                <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                  <legend className="mb-2 p-0 text-[14px] text-ink-2">
                    Until it ships. The order takes the address’s delivery instructions too; the total stays the same.
                  </legend>
                  {otherAddresses.map((a, i) => (
                    <label key={a.id} className="flex cursor-pointer items-start gap-2.5 rounded-input border border-line px-3 py-2.5 text-[14px] has-[:checked]:border-ink">
                      <input type="radio" name="addressId" value={a.id} defaultChecked={i === 0} required className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-ink" />
                      <span>
                        <strong className="font-semibold">{a.name}</strong>
                        {`, ${[a.line1, a.line2, `${a.city} ${a.zip}`].filter(Boolean).join(', ')}`}
                        {a.isDefault ? <span className="text-ink-3"> · Default</span> : null}
                      </span>
                    </label>
                  ))}
                </fieldset>
                <button type="submit" className={`${buttonClasses({ variant: 'secondary', size: 'sm' })} self-start`}>Deliver here</button>
              </form>
            ) : (
              <p className="mb-0 mt-3 text-[14px] text-ink-2">
                Your address book has no other address in this store. Add one, then come back here to send this order there before it ships.
              </p>
            )}
            <a href={sp('/account/addresses')} className="mt-3 inline-block text-[14px] text-ink underline underline-offset-2">
              {otherAddresses.length ? 'Add or edit addresses' : 'Add an address'}
            </a>
          </details>
        ) : null}

        {instructionsOpen ? (
          <details className="rounded-panel border border-line bg-surface px-[18px] py-3.5" open={error === 'invalid_input' || undefined}>
            <summary className="cursor-pointer text-[15px] font-semibold text-ink">
              {order.shipTo.instructions ? 'Change delivery instructions' : 'Add delivery instructions'}
            </summary>
            <form action={updateOrderInstructions.bind(null, order.id)} className="mt-3 flex flex-col gap-3">
              <InstructionsField
                defaultValue={order.shipTo.instructions}
                hint="For this order, until it’s out for delivery. Leave it blank to remove them. Your address book keeps its own note."
              />
              <button type="submit" className={`${buttonClasses({ variant: 'secondary', size: 'sm' })} self-start`}>Save instructions</button>
            </form>
          </details>
        ) : null}

        {order.status === 'awaiting_payment' ? (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-[18px] py-4" aria-label="Payment">
            <p className="m-0 max-w-[460px] text-[14px] text-ink-2">
              This order isn’t paid yet, so it hasn’t been placed. Pay {money(order.totals.totalMinor)} by card on Stripe’s secure page, or cancel it to release the items. You haven’t been charged.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <form action={payForOrder.bind(null, order.id)}>
                <button type="submit" className={buttonClasses({ variant: 'primary' })}>Complete payment</button>
              </form>
              <ConfirmAction
                action={cancelMyOrder.bind(null, order.id)}
                label="Cancel order"
                prompt={<>Cancel this order? You haven’t been charged, and the items go back on sale.</>}
                confirmLabel="Yes, cancel it"
                pendingLabel="Cancelling…"
                cancelLabel="Keep order"
              />
            </div>
          </section>
        ) : null}

        {view.cancelUntil ? (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-[18px] py-4" aria-label="Cancel order">
            <p className="m-0 text-[14px] text-ink-2">
              Changed your mind? You can cancel until it ships, {lcFirst(stepTime(view.cancelUntil, store, now))}.
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              {order.items.length > 1 ? (
                <a href={sp(`/orders/${encodeURIComponent(order.id)}/cancel`)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Cancel items</a>
              ) : null}
              <ConfirmAction
                action={cancelMyOrder.bind(null, order.id)}
                label="Cancel order"
                prompt={<>Cancel this order? {refundPromise(order, money(order.totals.totalMinor))}</>}
                confirmLabel="Yes, cancel it"
                pendingLabel="Cancelling…"
                cancelLabel="Keep order"
              />
            </div>
          </section>
        ) : null}

        {missingUntil ? (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-[18px] py-4" aria-labelledby="missing-h">
            <div className="flex max-w-[640px] flex-col gap-0.5">
              <h2 id="missing-h" className="m-0 text-[16px] font-semibold">Package didn’t arrive?</h2>
              <p className="m-0 text-[14px] text-ink-2">
                If it says delivered but you can’t find it, look around your door and ask anyone nearby who might have taken it in.
                Still missing? Report it by {longDate(missingUntil, store)} and{' '}
                {replaceMissing ? 'we’ll send it again at no charge, or ' : ''}we’ll refund {money(order.totals.totalMinor)} to {refundTo(order.paymentMethod, order.paymentLabel)}.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {replaceMissing ? (
                <ConfirmAction
                  action={reportMissing.bind(null, order.id, 'replacement')}
                  label="Send a replacement"
                  prompt={<>Send everything in this order again, at no charge? It would arrive by {longDate(replaceMissing, store)}. There’s nothing to send back.</>}
                  confirmLabel="Yes, send it again"
                  pendingLabel="Sending…"
                  cancelLabel="Keep looking"
                />
              ) : null}
              <ConfirmAction
                action={reportMissing.bind(null, order.id, 'refund')}
                label={replaceMissing ? 'Get a refund' : 'Report it missing'}
                prompt={<>Report this order as not arrived? We’ll refund {money(order.totals.totalMinor)} to {refundTo(order.paymentMethod, order.paymentLabel)}, and you won’t be able to return anything from it.</>}
                confirmLabel="Yes, it didn’t arrive"
                pendingLabel="Reporting…"
                cancelLabel="Keep looking"
              />
            </div>
          </section>
        ) : null}

        {returns && returnBy ? (
          <section className="flex flex-col gap-3" aria-labelledby="returns-h">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-[18px] py-4">
              <div className="flex flex-col gap-0.5">
                <h2 id="returns-h" className="m-0 text-[16px] font-semibold">Returns</h2>
                <p className="m-0 text-[14px] text-ink-2">
                  {reportedMissing
                    ? 'You told us this order didn’t arrive.'
                    : canStartReturn(returns, now)
                      ? `Eligible for return ${windows ? returnUntilText(windows, store) : `until ${longDate(returnBy, store)}`}.`
                      : returnBy.getTime() < now.getTime()
                        ? `The return window closed on ${longDate(returnBy, store)}.`
                        : 'Every item in this order is being returned.'}
                </p>
              </div>
              {canStartReturn(returns, now) ? (
                <a href={sp(`/orders/${encodeURIComponent(order.id)}/return`)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                  {Object.values(returns.replaceable).some((n) => n > 0) ? 'Return or replace items' : 'Return items'}
                </a>
              ) : null}
            </div>
            {returns.returns.map((r) => (
              <ReturnCard
                key={r.id}
                r={r}
                currency={order.currency}
                market={order.market}
                method={order.paymentMethod}
                label={order.paymentLabel}
                store={store}
                now={now}
                cancel={
                  r.status === 'requested' && (!r.replacement || Date.parse(r.replacement.shippedAt) > now.getTime())
                    ? cancelMyReturn.bind(null, order.id, r.id)
                    : undefined
                }
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
                {it.size ? <span className="text-[13px] text-ink-2">Size: {it.size}</span> : null}
                <span className="text-[13px] text-ink-3">
                  Qty {it.qty} · Sold by{' '}
                  <a href={sp(`/seller?name=${encodeURIComponent(it.seller)}`)} className="text-ink-3 underline underline-offset-2">{it.seller}</a>
                </span>
                {it.unitDiscountMinor ? <span className="text-[13px] font-semibold text-good-strong">Coupon −{money(it.unitDiscountMinor * it.qty)}</span> : null}
                {it.protectionMinor ? <span className="text-[13px] text-ink-2">+ {protectionPlanName(order.market)} · {money(it.protectionMinor * it.qty)}</span> : null}
                {view.delivered ? (
                  reviewed.has(it.productId) ? (
                    <a href={sp(`/product/${encodeURIComponent(it.productId)}#write-review`)} className="self-start text-[13px] text-ink underline underline-offset-2" aria-label={`Edit your review: ${it.title}`}>
                      Edit your review
                    </a>
                  ) : (
                    <a href={sp(`/product/${encodeURIComponent(it.productId)}#write-review`)} className="self-start text-[13px] text-ink underline underline-offset-2" aria-label={`Write a product review: ${it.title}`}>
                      Write a product review
                    </a>
                  )
                ) : null}
                {order.status === 'placed' && order.items.length > 1 ? (
                  <a
                    href={sp(`/orders/${encodeURIComponent(order.id)}/gift-receipt?item=${encodeURIComponent(it.productId)}`)}
                    className="self-start text-[13px] text-ink underline underline-offset-2"
                    aria-label={`Gift receipt for ${it.title}`}
                  >
                    Gift receipt for this item
                  </a>
                ) : null}
              </div>
              <div className="flex flex-none flex-col items-end gap-1.5">
                <strong className="tabular-nums">{money(it.unitPriceMinor * it.qty)}</strong>
                {order.status === 'awaiting_payment' ? null : availabilityOf(nowById.get(it.productId)) === 'available' ? (
                  <BuyAgainButton productId={it.productId} title={it.title} size={it.size} />
                ) : (
                  <span className="text-[12px] text-ink-3">Currently unavailable</span>
                )}
              </div>
            </div>
          ))}
          <dl className="m-0 flex flex-col gap-1 border-t border-line-2 px-[18px] py-3.5 text-[14px]">
            <div className="flex justify-between"><dt className="text-ink-2">Items</dt><dd className="m-0 tabular-nums">{money(order.totals.subtotalMinor)}</dd></div>
            {(order.totals.discountMinor ?? 0) > (order.totals.promoMinor ?? 0) ? (
              <div className="flex justify-between"><dt className="text-ink-2">Coupon savings</dt><dd className="m-0 tabular-nums">−{money((order.totals.discountMinor ?? 0) - (order.totals.promoMinor ?? 0))}</dd></div>
            ) : null}
            {order.totals.promoMinor ? (
              <div className="flex justify-between"><dt className="text-ink-2">Promotion{order.promoCode ? ` (${order.promoCode})` : ''}</dt><dd className="m-0 tabular-nums">−{money(order.totals.promoMinor)}</dd></div>
            ) : null}
            <div className="flex justify-between"><dt className="text-ink-2">Delivery</dt><dd className="m-0 tabular-nums">{order.totals.shipMinor === 0 ? 'FREE' : money(order.totals.shipMinor)}</dd></div>
            {order.totals.wrapMinor ? (
              <div className="flex justify-between"><dt className="text-ink-2">Gift wrap</dt><dd className="m-0 tabular-nums">{money(order.totals.wrapMinor)}</dd></div>
            ) : null}
            {order.totals.protectionMinor ? (
              <div className="flex justify-between"><dt className="text-ink-2">Protection plans</dt><dd className="m-0 tabular-nums">{money(order.totals.protectionMinor)}</dd></div>
            ) : null}
            {order.totals.taxMinor > 0 ? (
              <div className="flex justify-between"><dt className="text-ink-2">Tax</dt><dd className="m-0 tabular-nums">{money(order.totals.taxMinor)}</dd></div>
            ) : (
              <div className="flex justify-between"><dt className="text-ink-2">Tax</dt><dd className="m-0 text-ink-3">{store.pricing.taxNote ?? 'Inclusive of all taxes'}</dd></div>
            )}
          </dl>
        </section>

        <CancelledItems order={order} store={store} href={(productId) => sp(`/product/${encodeURIComponent(productId)}`)} />

        {deliveryUntil ? (
          deliveryFeedbackOpen(order, now) ? (
            <DeliveryFeedbackSection
              feedback={deliveryFeedback}
              openUntil={longDate(deliveryUntil, store)}
              rate={rateDelivery.bind(null, order.id)}
              remove={removeDeliveryRating.bind(null, order.id)}
            />
          ) : (
            <DeliveryFeedbackSection feedback={deliveryFeedback} />
          )
        ) : null}

        {feedbackUntil ? (
          <SellerFeedbackSection
            openUntil={feedbackOpen(order, now) ? longDate(feedbackUntil, store) : null}
            rows={orderSellers(order)
              .map((seller) =>
                feedbackOpen(order, now)
                  ? {
                      seller,
                      feedback: sellerFeedback.get(seller),
                      rate: rateSeller.bind(null, order.id, seller),
                      remove: removeSellerRating.bind(null, order.id, seller),
                    }
                  : { seller, feedback: sellerFeedback.get(seller) },
              )
              .filter((r) => r.rate || r.feedback)}
          />
        ) : null}

        <div className="flex flex-wrap gap-2.5">
          <a href={sp('/orders')} className={buttonClasses({ variant: 'secondary' })}>View all orders</a>
          <a href={sp(`/customer-service/contact?order=${encodeURIComponent(order.id)}`)} className={buttonClasses({ variant: 'secondary' })}>Get help with this order</a>
          <a href={sp('/')} className={buttonClasses({ variant: 'secondary' })}>Continue shopping</a>
        </div>
      </div>
    </AppShell>
  );
}
