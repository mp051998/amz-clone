import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ProductFrame } from '@/components/decision';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { EtaPanel, FactsCard, Timeline } from '@/components/orders/Tracking';
import { dayLabel, lcFirst, longDate, noRushText, orderView, paidWithText, paymentText, releaseDate, returnUntilText, stepTime, timeOfDay } from '@/components/orders/format';
import { balanceMethod, storeBalance } from '@/lib/data/balance';
import { archiveMyOrder, cancelMyOrder, changeOrderAddress, payCodNow, payForOrder, rateDelivery, rateSeller, removeDeliveryRating, removeSellerRating, requestMyCancellation, updateOrderInstructions } from '@/app/actions/order';
import { cancelMyReturn, changeReturnMethod, reportMissing } from '@/app/actions/returns';
import { withdrawMyClaim } from '@/app/actions/claims';
import { BuyAgainButton } from '@/components/orders/BuyAgainButton';
import { PairsWith } from '@/components/cart/PairsWith';
import { refundTo, ReturnCard } from '@/components/orders/Returns';
import { ReturnMethodFields } from '@/components/orders/ReturnMethod';
import { CancelledItems } from '@/components/orders/CancelledItems';
import { PriceGuarantees } from '@/components/orders/PriceGuarantees';
import { ClaimsSection } from '@/components/orders/Claims';
import { SellerFeedbackSection } from '@/components/orders/SellerFeedback';
import { DeliveryFeedbackSection } from '@/components/orders/DeliveryFeedback';
import { deliveryFeedbackFor, deliveryFeedbackOpen, deliveryFeedbackOpenUntil, type DeliveryFeedback } from '@/lib/data/delivery-feedback';
import { isReturnable } from '@/lib/data/return-policy';
import { canStartReturn, getOrderReturns, reportMissingUntil, returnPickupDays, returnWindows } from '@/lib/data/returns';
import { orderClaims } from '@/lib/data/atoz-claims';
import { claimableSellers, claimOpenUntil, type AtozClaim } from '@/lib/atoz';
import { DropoffField, InstructionsField } from '@/components/checkout/AddressFields';
import { deliveryOptions, orderStage } from '@/lib/decision/tracking';
import { messageFor } from '@/lib/data/errors';
import { holidayReturnBy } from '@/lib/holiday-returns';
import { firstName, readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { getOrder } from '@/lib/data/orders';
import { listAddresses } from '@/lib/data/addresses';
import { getPickupPoint, listPickupPoints, pickupBy } from '@/lib/data/pickup';
import { getProducts } from '@/lib/data/catalog';
import { reviewedProductIds } from '@/lib/data/reviews';
import { recallsFor, type Recall } from '@/lib/data/recalls';
import { feedbackOpen, feedbackOpenUntil, orderFeedback, orderSellers, type SellerFeedback } from '@/lib/data/seller-feedback';
import { availabilityOf } from '@/lib/buy-again';
import { accessoriesFor, type Accessory } from '@/lib/decision/server';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { conditionLabel } from '@/lib/offers';
import type { Db } from '@/lib/db/client';
import type { Address, Order, OrderItem } from '@/lib/types';
import { protectionPlanName } from '@/lib/protection';
import { emiText } from '@/lib/emi';
import { weekdayName } from '@/lib/delivery-day';
import { DROPOFF } from '@/lib/dropoff';
import { exchangeText } from '@/lib/exchange';
import { CHECKOUT_BANKS } from '@/lib/bank-offers';
import { selectClass } from '@/components/lib/controls';
import { stripeConfigured } from '@/lib/stripe';

export const metadata: Metadata = { title: 'Your order · Store' };

/** Orders placed this recently count as "just placed" even without ?placed=1 (e.g. a refresh). */
const JUST_PLACED_MS = 10 * 60_000;

function addressLine(o: Order): string {
  const s = o.shipTo;
  return [s.name, s.line1, s.line2, `${s.city} ${s.postcode}`].filter(Boolean).join(', ');
}

/** Why a return method didn't take (`method_error`), after "Return started, but" or on its own. */
const METHOD_ERROR: Record<string, string> = {
  method: 'it can’t be picked up: an order collected from a pickup point goes back to one.',
  pickup_point: 'that drop-off point isn’t taking returns. Choose another, or drop it off at any point.',
  pickup_on: 'that pickup day isn’t available. Choose a day from tomorrow until the drop-off deadline.',
};

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
    const bought = await getProducts(client, [...new Set(o.items.map((i) => i.offerOf ?? i.productId))]);
    return await accessoriesFor(bought.filter((p) => p.market === o.market), 4, client);
  } catch {
    return [];
  }
}

/**
 * Where a refund of the order's total goes, mid-sentence: "$34.06 to Visa ending 4242". On an order
 * paid partly from the balance the payment method gets back what it paid first (less what's gone
 * back to it already), and the balance the rest.
 */
function refundToText(o: Order, money: (minor: number) => string): string {
  const amount = o.totals.totalMinor;
  const to = refundTo(o.paymentMethod, o.paymentLabel);
  if (!o.split) return `${money(amount)} to ${to}`;
  const back = (o.cancellations ?? []).reduce((s, c) => s + c.refund.amountMinor - (c.refund.balanceMinor ?? 0), 0);
  const paid = Math.min(amount, Math.max(o.split.chargedMinor - back, 0));
  const toBalance = `${money(amount - paid)} to ${refundTo(balanceMethod(o.market), '')}`;
  return paid > 0 ? `${money(paid)} to ${to} and ${toBalance}` : toBalance;
}

/** What cancelling does with the money, for the confirm step. */
function refundPromise(o: Order, money: (minor: number) => string): string {
  if (o.paymentMethod === 'cod') return 'Nothing has been charged yet.';
  if (o.split) return `We’ll refund ${refundToText(o, money)}.`;
  const total = money(o.totals.totalMinor);
  if (o.paymentMethod === 'card') return `We’ll refund ${total} to your card.`;
  return `${total} goes back to ${refundTo(o.paymentMethod, o.paymentLabel)}.`;
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string; cancelled?: string; error?: string; return?: string; method_error?: string; archived?: string; instructions?: string; address?: string; feedback?: string; delivery?: string; claim?: string; paid?: string; refunded?: string }>;
}) {
  const { id } = await params;
  const { placed, cancelled, error, return: returned, method_error: methodError, archived, instructions, address, feedback, delivery, claim, paid, refunded } = await searchParams;
  const store = await getMarketplace();
  const user = await readUser();
  if (!user) redirect(storePath(store, `/signin?next=${encodeURIComponent(`/orders/${id}`)}`));
  const client = await db();
  const order = await getOrder(client, id);
  if (!order) notFound();
  if (order.market !== store.id) redirect(storePath({ id: order.market }, `/orders/${encodeURIComponent(order.id)}`));

  const now = new Date();
  const money = (minor: number) => formatMoney(minor, order.currency);
  const noRush = noRushText(order, now, money, store);
  const sp = (path: string) => storePath(store, path);
  const view = orderView(order, store, now);
  const countText = `${view.itemCount} ${view.itemCount === 1 ? 'item' : 'items'}`;
  const placedAt = Date.parse(order.placedAt ?? order.createdAt);
  const confirming = order.status === 'placed' && (placed === '1' || now.getTime() - placedAt < JUST_PLACED_MS) && placed !== '0';
  const productIds = order.items.map((i) => i.productId);
  // reviews and recalls go by the product, also for an item bought from another seller
  const productOf = (i: OrderItem) => i.offerOf ?? i.productId;
  const reviewIds = [...new Set(order.items.map(productOf))];
  // the sellers can be rated once it arrives, for 90 days
  const feedbackUntil = feedbackOpenUntil(order, now);
  const noFeedback = new Map<string, SellerFeedback>();
  // the delivery can be rated for 30 days after it arrives
  const deliveryUntil = deliveryFeedbackOpenUntil(order, now);
  // the address can change until the order ships; delivery instructions until it's out for delivery
  const stage = orderStage(order, now, store.dates.timeZone);
  const addressOpen = stage === 'preparing';
  // a pickup order has no courier to instruct
  const instructionsOpen = !order.pickup && (stage === 'preparing' || stage === 'shipped');
  // a Pay on Delivery order can be paid online instead until it arrives ("Pay now")
  const payNowOpen = order.paymentMethod === 'cod' && order.status === 'placed' && stage !== 'delivered';
  const wallet = payNowOpen ? await storeBalance(client, store.id).catch(() => null) : null;
  const walletName = paymentText(balanceMethod(store.id), '');
  const point = order.pickup ? await getPickupPoint(client, store.id, order.pickup.pointId).catch(() => null) : null;
  const readyAt = order.deliveredAt ?? (view.delivered ? view.eta?.toISOString() : undefined);
  const collectBy = point && readyAt ? pickupBy(readyAt, point.holdDays) : null;
  const [returns, current, reviewed, sellerFeedback, saved, deliveryFeedback, recalled, claims] = confirming
    ? [null, [], new Set<string>(), noFeedback, [], null, new Map<string, Recall>(), []]
    : await Promise.all([
        getOrderReturns(client, order.id),
        getProducts(client, [...new Set([...productIds, ...reviewIds])], { includeArchived: true }).catch(() => []),
        view.delivered ? reviewedProductIds(client, user.id, reviewIds).catch(() => new Set<string>()) : new Set<string>(),
        feedbackUntil ? orderFeedback(client, order.id).catch(() => noFeedback) : noFeedback,
        addressOpen ? listAddresses(client, store.id).catch((): Address[] => []) : [],
        deliveryUntil ? deliveryFeedbackFor(client, order.id).catch((): DeliveryFeedback | null => null) : null,
        order.status === 'placed' ? recallsFor(client, reviewIds).catch(() => new Map<string, Recall>()) : new Map<string, Recall>(),
        order.status === 'placed' ? orderClaims(client, order.id).catch((): AtozClaim[] => []) : ([] as AtozClaim[]),
      ]);
  const nowById = new Map(current.map((p) => [p.id, p]));
  // buy it again from the same seller, or the product itself once that seller has none left
  const again = order.items.map(
    (i) => [i.productId, i.offerOf].find((id): id is string => id != null && availabilityOf(nowById.get(id)) === 'available') ?? null,
  );
  const otherAddresses = saved.filter((a) => !sameAddress(a, order.shipTo));
  const returnBy = returns?.returnBy ? new Date(returns.returnBy) : null;
  // bought November 1 to December 31 in the US: the window runs to January 31 (when that's later)
  const holidayBy = order.placedAt ? holidayReturnBy(store, order.placedAt) : null;
  const windows = returns ? returnWindows(returns, now) : null;
  const missingUntil = reportMissingUntil(order, returns, now);
  const reportedMissing = returns?.returns.some((r) => r.reason === 'not_received' && r.status !== 'cancelled') ?? false;
  const missingItems = returns?.returns.some((r) => r.reason === 'missing_item') ?? false;
  // how an open return goes back can change until it reaches us; a courier collects from the
  // delivery address, which an order collected from a pickup point doesn't have
  const sending = new Set(returns?.returns.filter((r) => r.status === 'requested' && r.reason !== 'not_received').map((r) => r.id) ?? []);
  const dropoffPoints = sending.size ? await listPickupPoints(client, store.id) : [];
  const collectFrom = order.pickup ? undefined : [order.shipTo.line1, order.shipTo.line2, `${order.shipTo.city} ${order.shipTo.postcode}`].filter(Boolean).join(', ');
  const methodErrorText = methodError
    ? (() => {
        const why = METHOD_ERROR[methodError] ?? lcFirst(messageFor(methodError) ?? 'something went wrong. Please try again.');
        return returned === 'started' || returned === 'replacement' || returned === 'exchange' ? `Return started, but ${why}` : why[0].toUpperCase() + why.slice(1);
      })()
    : null;
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
          <p className="m-0 text-[15px] text-ink-2">
            Your confirmation is in <a href={sp('/account/messages')} className="text-ink underline underline-offset-2">Your messages</a>.
          </p>
          <div className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-5">
            <span className="text-[13px] text-ink-3">{order.pickup ? 'Ready for pickup' : 'Arriving'}</span>
            <strong className="text-[24px] font-semibold">{view.eta ? dayLabel(view.eta, store, now) : 'Soon'}</strong>
            <span className="text-[15px] text-ink-2">{addressLine(order)}</span>
            {order.releaseAt && Date.parse(order.releaseAt) > now.getTime() ? (
              <span className="text-[15px] text-ink-2">Pre-order: it ships when it’s released on {releaseDate(new Date(order.releaseAt), store)}. You can cancel until then.</span>
            ) : null}
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

        {methodErrorText ? (
          <Alert tone="error">{methodErrorText}</Alert>
        ) : error === 'insufficient_balance' && payNowOpen ? (
          <Alert tone="error">Your {lcFirst(walletName)} doesn’t cover this order. Add money to it, or pay another way.</Alert>
        ) : error && refunded === '1' ? (
          <Alert tone="error">
            {error === 'amount_mismatch' ? 'Your order’s total changed while you were paying.' : 'This order can’t be paid now.'} We’ve refunded your card payment in full.
          </Alert>
        ) : error === 'order_not_cancellable' && order.status === 'placed' && !view.cancelUntil && !view.stopUntil ? (
          <Alert tone="error">
            {view.delivered ? 'It’s been delivered, so it can’t be cancelled now.' : 'It’s out for delivery now, so it can’t be stopped.'} You can return it once you have it.
          </Alert>
        ) : error ? (
          <Alert tone="error">{messageFor(error) ?? 'Something went wrong. Please try again.'}</Alert>
        ) : paid === '1' && order.prepaidAt ? (
          <Alert tone="success">Paid, thanks. {money(order.totals.totalMinor)} by {paymentText(order.paymentMethod, order.paymentLabel)}: there’s nothing to pay when it arrives.</Alert>
        ) : cancelled === '1' && order.status === 'cancelled' ? (
          <Alert tone="success">Your order is cancelled.</Alert>
        ) : cancelled === 'stopped' && order.status === 'cancelled' ? (
          <Alert tone="success">We’ve stopped your package: the carrier is bringing it back to us, and your order is cancelled.</Alert>
        ) : cancelled === 'items' && order.cancellations?.some((c) => !c.priceGuarantee) ? (
          <Alert tone="success">Items cancelled. The rest of your order is still on its way.</Alert>
        ) : returned === 'started' ? (
          <Alert tone="success">Return started. Send the items back as shown below, with the code.</Alert>
        ) : returned === 'replacement' ? (
          <Alert tone="success">Your replacement is on its way. Send the original items back as shown below, with the code.</Alert>
        ) : returned === 'exchange' ? (
          <Alert tone="success">Your exchange is on its way in the new size. Send the original items back as shown below, with the code.</Alert>
        ) : returned === 'method' ? (
          <Alert tone="success">Return method changed.</Alert>
        ) : returned === 'cancelled' ? (
          <Alert tone="success">Your return is cancelled.</Alert>
        ) : returned === 'missing' && reportedMissing ? (
          <Alert tone="success">Sorry your order didn’t arrive. We’ve refunded it, as shown below.</Alert>
        ) : claim === 'filed' && claims.some((c) => c.status === 'under_review') ? (
          <Alert tone="success">Claim filed. We’ll look into it and let you know within a few days.</Alert>
        ) : claim === 'withdrawn' ? (
          <Alert tone="success">Your claim is withdrawn.</Alert>
        ) : returned === 'missing-replacement' && reportedMissing ? (
          <Alert tone="success">Sorry your order didn’t arrive. We’re sending it again at no charge, as shown below.</Alert>
        ) : returned === 'missing-items' && missingItems ? (
          <Alert tone="success">Sorry those items were missing. We’ve refunded them, as shown below.</Alert>
        ) : returned === 'missing-items-replacement' && missingItems ? (
          <Alert tone="success">Sorry those items were missing. We’re sending them again at no charge, as shown below.</Alert>
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
        {recalled.size ? (
          <Alert tone="error">
            {recalled.size === 1 ? 'An item in this order has been recalled' : `${recalled.size} items in this order have been recalled`} for safety:{' '}
            <strong className="font-semibold">{[...recalled.values()].map((r) => r.title).join(', ')}</strong>.{' '}
            <a href={sp('/recalls')} className="text-ink underline underline-offset-2">See what to do</a>
          </Alert>
        ) : null}

        <EtaPanel kicker={view.kicker} headline={view.headline} window={view.window} />

        <section className="flex flex-col rounded-panel border border-line bg-surface p-[22px]" aria-labelledby="progress-h">
          <h2 id="progress-h" className="m-0 mb-3.5 text-[18px] font-semibold">Delivery progress</h2>
          <Timeline steps={view.steps} store={store} now={now} />
        </section>

        <FactsCard
          rows={[
            { label: 'Items', value: order.items.map((i) => `${i.title}${i.qty > 1 ? ` × ${i.qty}` : ''}`).join(', ') },
            { label: order.pickup ? 'Pick up at' : 'Deliver to', value: addressLine(order) },
            ...(order.shipTo.instructions ? [{ label: 'Instructions', value: <span className="whitespace-pre-line">{order.shipTo.instructions}</span> }] : []),
            ...(order.shipTo.dropoff && !order.pickup ? [{ label: 'Drop-off', value: DROPOFF[order.shipTo.dropoff].label }] : []),
            ...(order.releaseAt ? [{ label: 'Pre-order', value: `${Date.parse(order.releaseAt) > now.getTime() ? 'Releases' : 'Released'} ${releaseDate(new Date(order.releaseAt), store)}` }] : []),
            ...(order.shipSpeed === 'fast' ? [{ label: 'Delivery', value: 'Faster delivery' }] : []),
            ...(order.shipSpeed === 'day' ? [{ label: 'Delivery', value: `Your Delivery Day · ${weekdayName(order.deliveryDay ?? 0)}` }] : []),
            ...(noRush ? [{ label: 'Delivery', value: noRush }] : []),
            ...(order.gift ? [{ label: 'Gift', value: giftText(order.gift) }] : []),
            ...(order.gst ? [{ label: 'GST invoice', value: <>{order.gst.name} · GSTIN <span className="font-mono">{order.gst.gstin}</span></> }] : []),
            { label: 'Paid with', value: paidWithText(order) },
            ...(order.emiMonths ? [{ label: 'EMI', value: emiText(order.totals.totalMinor, order.emiMonths, money) }] : []),
            { label: 'Total', value: <span className="tabular-nums">{money(order.totals.totalMinor)}</span>, strong: true },
            ...(order.split
              ? [
                  { label: paymentText(balanceMethod(order.market), ''), value: <span className="tabular-nums">−{money(order.split.balanceMinor)}</span> },
                  { label: paymentText(order.paymentMethod, order.paymentLabel), value: <span className="tabular-nums">{money(order.split.chargedMinor)}</span> },
                ]
              : []),
          ]}
        />

        {order.deliveryOtp && order.status === 'placed' && stage !== 'delivered' ? (
          <section className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-[22px]" aria-labelledby="otp-h">
            <h2 id="otp-h" className="m-0 text-[18px] font-semibold">Delivery OTP</h2>
            {stage === 'out_for_delivery' ? (
              <>
                <strong className="font-mono text-[32px] font-semibold tracking-[0.2em] text-ink" aria-label={`Delivery OTP ${order.deliveryOtp.split('').join(' ')}`}>{order.deliveryOtp}</strong>
                <p className="m-0 text-[15px] text-ink-2">Share this one-time password with the delivery associate when your order arrives: they need it to hand the order over. Don’t share it before then.</p>
              </>
            ) : (
              <p className="m-0 text-[15px] text-ink-2">This order needs a one-time password at delivery. It shows here on the delivery day, for you to share with the delivery associate.</p>
            )}
          </section>
        ) : null}

        {order.pickup && order.status !== 'cancelled' ? (
          <section className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-[22px]" aria-labelledby="pickup-h">
            <h2 id="pickup-h" className="m-0 text-[18px] font-semibold">Pickup code</h2>
            {view.delivered ? (
              <>
                <strong className="font-mono text-[32px] font-semibold tracking-[0.2em] text-ink" aria-label={`Pickup code ${order.pickup.code.split('').join(' ')}`}>{order.pickup.code}</strong>
                <p className="m-0 text-[15px] text-ink-2">
                  {point?.kind === 'counter' ? 'Give this code at the counter' : 'Enter this code at the locker'}
                  {collectBy ? <>, by <strong className="font-semibold text-ink">{longDate(collectBy, store)}</strong></> : null}.
                </p>
              </>
            ) : (
              <p className="m-0 text-[15px] text-ink-2">Your pickup code shows here once the order is ready at {order.shipTo.line1}.</p>
            )}
            {point ? (
              <p className="m-0 text-[14px] text-ink-3">
                {point.name} · {point.hours} · holds orders {point.holdDays} days{point.kind === 'locker' ? ' · no cash' : ''}
              </p>
            ) : null}
          </section>
        ) : null}

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
              {order.shipTo.instructions || order.shipTo.dropoff ? 'Change delivery instructions' : 'Add delivery instructions'}
            </summary>
            <form action={updateOrderInstructions.bind(null, order.id)} className="mt-3 flex flex-col gap-3">
              <DropoffField defaultValue={order.shipTo.dropoff} hint="For this order, until it’s out for delivery. Your address book keeps its own." />
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
              This order isn’t paid yet, so it hasn’t been placed. Pay {money(order.split?.chargedMinor ?? order.totals.totalMinor)} by card on Stripe’s secure page, or cancel it to release the items. You haven’t been charged.
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

        {payNowOpen ? (
          <section id="pay-now" className="flex flex-col gap-3 rounded-panel border border-line bg-surface px-[18px] py-4" aria-labelledby="pay-now-h">
            <div className="flex max-w-[640px] flex-col gap-0.5">
              <h2 id="pay-now-h" className="m-0 text-[16px] font-semibold">Pay now for a contactless delivery</h2>
              <p className="m-0 text-[14px] text-ink-2">
                You’re paying {money(order.totals.totalMinor)} on delivery. Pay it online now instead, any time before it arrives, and there’s nothing to pay at the door.
                Cancel or return it later and it’s refunded the way you paid.
              </p>
            </div>
            <form action={payCodNow.bind(null, order.id)} className="flex flex-col gap-3">
              <fieldset className="m-0 flex max-w-[520px] flex-col gap-2 border-0 p-0">
                <legend className="sr-only">Pay with</legend>
                {stripeConfigured ? (
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-input border border-line px-3 py-2.5 text-[14px] has-[:checked]:border-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:text-ink-3">
                    <input type="radio" name="method" value="card" required className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-ink" />
                    <span>Credit or debit card<span className="block text-[13px] text-ink-3">On Stripe’s secure page</span></span>
                  </label>
                ) : null}
                <label className="flex cursor-pointer items-start gap-2.5 rounded-input border border-line px-3 py-2.5 text-[14px] has-[:checked]:border-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:text-ink-3">
                  <input type="radio" name="method" value="upi" defaultChecked required className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-ink" />
                  <span>UPI<span className="block text-[13px] text-ink-3">Pay from any UPI app</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-input border border-line px-3 py-2.5 text-[14px] has-[:checked]:border-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:text-ink-3">
                  <input type="radio" name="method" value="netbanking" required className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-ink" />
                  <span>Net banking<span className="block text-[13px] text-ink-3">Pay from your bank account</span></span>
                </label>
                <label className="ml-[30px] flex max-w-[320px] flex-col gap-1.5 text-[13px] text-ink-2">
                  Bank, for net banking
                  <select name="bank" defaultValue={CHECKOUT_BANKS[0]} className={`w-full ${selectClass}`}>
                    {CHECKOUT_BANKS.map((b) => (<option key={b} value={b}>{b}</option>))}
                  </select>
                </label>
                {wallet != null ? (
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-input border border-line px-3 py-2.5 text-[14px] has-[:checked]:border-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:text-ink-3">
                    <input type="radio" name="method" value="amazonpay" required disabled={wallet < order.totals.totalMinor} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-ink" />
                    <span>
                      {walletName}
                      <span className="block text-[13px] text-ink-3">
                        {wallet < order.totals.totalMinor ? `${money(wallet)} available, not enough for this order` : `${money(wallet)} available`}
                      </span>
                    </span>
                  </label>
                ) : null}
              </fieldset>
              <button type="submit" className={`${buttonClasses({ variant: 'primary', size: 'sm' })} self-start`}>Pay {money(order.totals.totalMinor)} now</button>
            </form>
          </section>
        ) : null}

        {view.cancelUntil ? (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-[18px] py-4" aria-label="Cancel order">
            <p className="m-0 text-[14px] text-ink-2">
              Changed your mind? You can cancel until it ships,{' '}
              {/* a pre-order's can be weeks off, past where a weekday says which day */}
              {order.releaseAt ? `${longDate(view.cancelUntil, store)} at ${timeOfDay(view.cancelUntil, store)}` : lcFirst(stepTime(view.cancelUntil, store, now))}.
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              {order.items.length > 1 ? (
                <a href={sp(`/orders/${encodeURIComponent(order.id)}/cancel`)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Cancel items</a>
              ) : null}
              <ConfirmAction
                action={cancelMyOrder.bind(null, order.id)}
                label="Cancel order"
                prompt={<>Cancel this order? {refundPromise(order, money)}</>}
                confirmLabel="Yes, cancel it"
                pendingLabel="Cancelling…"
                cancelLabel="Keep order"
              />
            </div>
          </section>
        ) : null}

        {view.stopUntil ? (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-[18px] py-4" aria-label="Request cancellation">
            <p className="m-0 max-w-[640px] text-[14px] text-ink-2">
              Changed your mind? It’s shipped, but until it goes out for delivery, {lcFirst(stepTime(view.stopUntil, store, now))}, we can have the carrier bring it back to us and cancel the order.
            </p>
            <ConfirmAction
              action={requestMyCancellation.bind(null, order.id)}
              label="Request cancellation"
              prompt={<>Stop this order on its way? The carrier brings it back to us and the order is cancelled. {refundPromise(order, money)}</>}
              confirmLabel="Yes, stop it"
              pendingLabel="Requesting…"
              cancelLabel="Keep order"
            />
          </section>
        ) : null}

        {missingUntil ? (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-[18px] py-4" aria-labelledby="missing-h">
            <div className="flex max-w-[640px] flex-col gap-0.5">
              <h2 id="missing-h" className="m-0 text-[16px] font-semibold">Package didn’t arrive?</h2>
              <p className="m-0 text-[14px] text-ink-2">
                If it says delivered but you can’t find it, look around your door and ask anyone nearby who might have taken it in.
                Still missing? Report it by {longDate(missingUntil, store)} and{' '}
                {replaceMissing ? 'we’ll send it again at no charge, or ' : ''}we’ll refund {refundToText(order, money)}.
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
                prompt={<>Report this order as not arrived? We’ll refund {refundToText(order, money)}, and you won’t be able to return anything from it.</>}
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
                      ? `${holidayBy && windows?.first.getTime() === holidayBy.getTime() ? 'Holiday returns: eligible' : 'Eligible'} for return ${windows ? returnUntilText(windows, store) : `until ${longDate(returnBy, store)}`}.`
                      : !order.items.some(isReturnable)
                        ? order.items.length === 1
                          ? 'This item can’t be returned.'
                          : 'Items in this order can’t be returned.'
                        : returnBy.getTime() < now.getTime()
                          ? `The return window closed on ${longDate(returnBy, store)}.`
                          : 'Every item in this order is being returned.'}
                </p>
              </div>
              {canStartReturn(returns, now) ? (
                <div className="flex flex-wrap items-center gap-2">
                  <a href={sp(`/orders/${encodeURIComponent(order.id)}/missing`)} className={buttonClasses({ variant: 'link' })}>
                    Item missing from package?
                  </a>
                  <a href={sp(`/orders/${encodeURIComponent(order.id)}/return`)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                    {Object.values(returns.replaceable).some((n) => n > 0) ? 'Return or replace items' : 'Return items'}
                  </a>
                </div>
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
                pickupFrom={collectFrom}
                change={
                  sending.has(r.id) ? (
                    <details className="text-[14px]" open={methodError && !returned ? true : undefined}>
                      <summary className="cursor-pointer font-semibold text-ink">Change return method</summary>
                      <form action={changeReturnMethod.bind(null, order.id, r.id)} className="mt-3 flex flex-col gap-3">
                        <ReturnMethodFields
                          idPrefix={`return-${r.id}`}
                          legend="How will you send it back?"
                          points={dropoffPoints}
                          days={returnPickupDays(store.dates.timeZone, now, r.dropoffBy)}
                          pickupFrom={collectFrom}
                          store={store}
                          now={now}
                          current={{ pointId: r.dropoffPoint?.id, pickupOn: r.pickupOn }}
                        />
                        <button type="submit" className={`${buttonClasses({ variant: 'secondary', size: 'sm' })} self-start`}>Save return method</button>
                      </form>
                    </details>
                  ) : undefined
                }
              />
            ))}
          </section>
        ) : null}

        <ClaimsSection
          claims={claims}
          sellers={claimableSellers(order, claims, now)}
          openUntil={claimOpenUntil(order, now)}
          fileHref={sp(`/orders/${encodeURIComponent(order.id)}/claim`)}
          withdraw={(claimId) => withdrawMyClaim.bind(null, order.id, claimId)}
          currency={order.currency}
          refundTo={refundTo(order.paymentMethod, order.paymentLabel)}
          store={store}
        />

        <section className="overflow-hidden rounded-panel border border-line bg-surface" aria-labelledby="items-h">
          <h2 id="items-h" className="m-0 px-[18px] pb-1 pt-4 text-[16px] font-semibold">{countText}</h2>
          {order.items.map((it, n) => (
            <div key={it.productId} className="flex flex-wrap items-center gap-3.5 border-t border-line-2 px-[18px] py-3.5 first-of-type:border-t-0">
              <a href={sp(`/product/${it.productId}`)} className="w-16 flex-none" tabIndex={-1} aria-hidden>
                <ProductFrame src={it.image} alt="" aspect="1/1" />
              </a>
              <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
                <a href={sp(`/product/${it.productId}`)} className="line-clamp-2 text-[15px] font-semibold text-ink no-underline">{it.title}</a>
                {it.size ? <span className="text-[13px] text-ink-2">Size: {it.size}</span> : null}
                {it.condition ? <span className="text-[13px] text-ink-2">Condition: {conditionLabel(it.condition)}</span> : null}
                {it.subscriptionId ? (
                  <a href={sp(`/subscribe-save#sub-${it.subscriptionId}`)} className="self-start text-[13px] font-semibold text-good-strong no-underline hover:underline">
                    Subscribe &amp; Save{it.unitSnsMinor ? ` · you saved ${money(it.unitSnsMinor * it.qty)}` : ''}
                  </a>
                ) : null}
                {recalled.has(productOf(it)) ? (
                  <a href={sp(`/recalls#recall-${encodeURIComponent(productOf(it))}`)} className="self-start text-[13px] font-semibold text-bad underline underline-offset-2">
                    Recalled · See what to do
                  </a>
                ) : null}
                <span className="text-[13px] text-ink-3">
                  Qty {it.qty} · Sold by{' '}
                  <a href={sp(`/seller?name=${encodeURIComponent(it.seller)}`)} className="text-ink-3 underline underline-offset-2">{it.seller}</a>
                </span>
                {!isReturnable(it) ? (
                  <span className="text-[13px] text-ink-2">Not returnable</span>
                ) : it.replacementOnly ? (
                  <span className="text-[13px] text-ink-2">Replacement only{it.returnDays ? `, within ${it.returnDays} days of delivery` : ''}</span>
                ) : it.returnDays ? (
                  <span className="text-[13px] text-ink-2">Returnable within {it.returnDays} days of delivery</span>
                ) : null}
                {(it.unitDiscountMinor ?? 0) > (it.unitExchangeMinor ?? 0) ? <span className="text-[13px] font-semibold text-good-strong">Coupon −{money(((it.unitDiscountMinor ?? 0) - (it.unitExchangeMinor ?? 0)) * it.qty)}</span> : null}
                {it.unitExchangeMinor && order.exchange ? (
                  <span className="text-[13px] text-ink-2">
                    <span className="font-semibold text-good-strong">Exchange −{money(it.unitExchangeMinor * it.qty)}</span> for your {exchangeText(order.exchange.device, order.exchange.condition)}
                    {order.status === 'cancelled' ? null : view.delivered ? ', collected at delivery' : '. Keep it ready: it’s collected when this is delivered.'}
                  </span>
                ) : null}
                {it.protectionMinor ? <span className="text-[13px] text-ink-2">+ {protectionPlanName(order.market)} · {money(it.protectionMinor * it.qty)}</span> : null}
                {view.delivered ? (
                  reviewed.has(productOf(it)) ? (
                    <a href={sp(`/product/${encodeURIComponent(productOf(it))}#write-review`)} className="self-start text-[13px] text-ink underline underline-offset-2" aria-label={`Edit your review: ${it.title}`}>
                      Edit your review
                    </a>
                  ) : (
                    <a href={sp(`/product/${encodeURIComponent(productOf(it))}#write-review`)} className="self-start text-[13px] text-ink underline underline-offset-2" aria-label={`Write a product review: ${it.title}`}>
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
                {order.status === 'awaiting_payment' ? null : (
                  <a
                    href={sp(`/customer-service/contact?${new URLSearchParams({ seller: it.seller, order: order.id })}`)}
                    className="self-start text-[13px] text-ink underline underline-offset-2"
                    aria-label={`Contact ${it.seller} about ${it.title}`}
                  >
                    Contact seller
                  </a>
                )}
              </div>
              <div className="flex flex-none flex-col items-end gap-1.5">
                <strong className="tabular-nums">{money(it.unitPriceMinor * it.qty)}</strong>
                {order.status === 'awaiting_payment' ? null : again[n] ? (
                  <BuyAgainButton productId={again[n]} title={it.title} size={it.size} />
                ) : (
                  <span className="text-[12px] text-ink-3">Currently unavailable</span>
                )}
              </div>
            </div>
          ))}
          <dl className="m-0 flex flex-col gap-1 border-t border-line-2 px-[18px] py-3.5 text-[14px]">
            <div className="flex justify-between"><dt className="text-ink-2">Items</dt><dd className="m-0 tabular-nums">{money(order.totals.subtotalMinor)}</dd></div>
            {order.totals.memberMinor ? (
              <div className="flex justify-between"><dt className="text-ink-2">{store.membership.name} savings</dt><dd className="m-0 tabular-nums">−{money(order.totals.memberMinor)}</dd></div>
            ) : null}
            {(order.totals.discountMinor ?? 0) > (order.totals.promoMinor ?? 0) + (order.totals.memberMinor ?? 0) + (order.totals.qtyDiscountMinor ?? 0) + (order.totals.snsMinor ?? 0) + (order.totals.bankOfferMinor ?? 0) + (order.totals.exchangeMinor ?? 0) + (order.totals.guaranteeMinor ?? 0) ? (
              <div className="flex justify-between"><dt className="text-ink-2">Coupon savings</dt><dd className="m-0 tabular-nums">−{money((order.totals.discountMinor ?? 0) - (order.totals.promoMinor ?? 0) - (order.totals.memberMinor ?? 0) - (order.totals.qtyDiscountMinor ?? 0) - (order.totals.snsMinor ?? 0) - (order.totals.bankOfferMinor ?? 0) - (order.totals.exchangeMinor ?? 0) - (order.totals.guaranteeMinor ?? 0))}</dd></div>
            ) : null}
            {order.totals.qtyDiscountMinor ? (
              <div className="flex justify-between"><dt className="text-ink-2">Quantity discounts</dt><dd className="m-0 tabular-nums">−{money(order.totals.qtyDiscountMinor)}</dd></div>
            ) : null}
            {order.totals.snsMinor ? (
              <div className="flex justify-between"><dt className="text-ink-2">Subscribe &amp; Save</dt><dd className="m-0 tabular-nums">−{money(order.totals.snsMinor)}</dd></div>
            ) : null}
            {order.totals.promoMinor ? (
              <div className="flex justify-between"><dt className="text-ink-2">Promotion{order.promoCode ? ` (${order.promoCode})` : ''}</dt><dd className="m-0 tabular-nums">−{money(order.totals.promoMinor)}</dd></div>
            ) : null}
            {order.totals.bankOfferMinor ? (
              <div className="flex justify-between"><dt className="text-ink-2">Bank offer{order.bank ? ` (${order.bank})` : ''}</dt><dd className="m-0 tabular-nums">−{money(order.totals.bankOfferMinor)}</dd></div>
            ) : null}
            {order.totals.exchangeMinor ? (
              <div className="flex justify-between"><dt className="text-ink-2">Exchange offer</dt><dd className="m-0 tabular-nums">−{money(order.totals.exchangeMinor)}</dd></div>
            ) : null}
            {order.totals.guaranteeMinor ? (
              <div className="flex justify-between"><dt className="text-ink-2">Pre-order Price Guarantee</dt><dd className="m-0 tabular-nums">−{money(order.totals.guaranteeMinor)}</dd></div>
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

        <PriceGuarantees order={order} store={store} href={(productId) => sp(`/product/${encodeURIComponent(productId)}`)} />

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
