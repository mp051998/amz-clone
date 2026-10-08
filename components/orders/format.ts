import type { Store } from '../lib/store';
import type { Order, OrderCancellation } from '@/lib/types';
import type { TrackingStep } from '@/lib/decision/types';
import { cancellableUntil, deliveryEta, isDelivered, stoppableUntil, trackingSteps } from '@/lib/decision/tracking';
import { DROPOFF } from '@/lib/dropoff';
import { formatMoney } from '@/lib/marketplaces';
import { balanceMethod } from '@/lib/data/balance';

/**
 * Store-aware date wording for carts, orders and tracking (design.md §13): relative day names
 * ("Today", "Tomorrow") in the store's time zone, US month-first vs IN day-first dates.
 * Pure — pass `now` for deterministic output.
 */
export type StoreDates = Pick<Store, 'dates' | 'locale'>;

const DAY = 86_400_000;

function dayKey(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** "Tomorrow, 9 AM" → "tomorrow, 9 AM" (only the first letter). */
export function lcFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

/** Neutral payment wording (the stored label may carry the old retailer brand). */
export function paymentText(method: string, label: string): string {
  if (method === 'giftcard') return 'Gift card balance';
  if (method === 'amazonpay') return 'Wallet balance';
  if (method === 'cod') return 'Pay on delivery';
  if (method === 'paylater') return 'Pay Later';
  return label;
}

/** How an order was paid: `paymentText`, with "+ Gift card balance" when the balance paid part of it. */
export function orderPaymentText(order: Pick<Order, 'market' | 'paymentMethod' | 'paymentLabel' | 'split'>): string {
  const label = paymentText(order.paymentMethod, order.paymentLabel);
  return order.split ? `${label} + ${paymentText(balanceMethod(order.market), '')}` : label;
}

/** "Today" / "Tomorrow" / "Yesterday", else null. */
export function relativeDayName(date: Date, store: StoreDates, now: Date = new Date()): string | null {
  const tz = store.dates.timeZone;
  const k = dayKey(date, tz);
  if (k === dayKey(now, tz)) return 'Today';
  if (k === dayKey(new Date(now.getTime() + DAY), tz)) return 'Tomorrow';
  if (k === dayKey(new Date(now.getTime() - DAY), tz)) return 'Yesterday';
  return null;
}

/** "September 28" (US) / "28 September" (IN). */
export function shortDate(date: Date, store: StoreDates): string {
  return new Intl.DateTimeFormat(store.locale.default, { day: 'numeric', month: 'long', timeZone: store.dates.timeZone }).format(date);
}

/** A release date, with its year: "November 20, 2026" (US) / "20 November 2026" (IN). */
export function releaseDate(date: Date, store: StoreDates): string {
  return new Intl.DateTimeFormat(store.locale.default, { day: 'numeric', month: 'long', year: 'numeric', timeZone: store.dates.timeZone }).format(date);
}

/** "Sunday, September 28" (US) / "Sunday, 28 September" (IN). */
export function longDate(date: Date, store: StoreDates): string {
  return new Intl.DateTimeFormat(store.locale.default, { weekday: 'long', day: 'numeric', month: 'long', timeZone: store.dates.timeZone }).format(date);
}

/**
 * "until Sunday, October 30", or "until Sunday, October 30; replacement items until Friday,
 * November 11" when a replacement's own window (from its delivery) runs later.
 */
export function returnUntilText(w: { first: Date; last: Date }, store: StoreDates): string {
  const first = longDate(w.first, store);
  const last = longDate(w.last, store);
  return first === last ? `until ${first}` : `until ${first}; replacement items until ${last}`;
}

/** "9:14 PM" (US) / "9:14 pm" (IN). */
export function timeOfDay(date: Date, store: StoreDates): string {
  return new Intl.DateTimeFormat(store.locale.default, { hour: 'numeric', minute: '2-digit', timeZone: store.dates.timeZone }).format(date);
}

/** "Tomorrow, September 28" or "Sunday, September 28". */
export function dayLabel(date: Date, store: StoreDates, now: Date = new Date()): string {
  const rel = relativeDayName(date, store, now);
  return rel ? `${rel}, ${shortDate(date, store)}` : longDate(date, store);
}

/** "Arriving tomorrow, September 28" / "Arriving Monday, 28 September". */
export function arrivingText(date: Date, store: StoreDates, now: Date = new Date()): string {
  const rel = relativeDayName(date, store, now);
  return `Arriving ${rel ? `${rel.toLowerCase()}, ${shortDate(date, store)}` : longDate(date, store)}`;
}

/** Timeline time: "Today, 9:14 PM" / "Sunday, 11:42 AM". */
export function stepTime(date: Date, store: StoreDates, now: Date = new Date()): string {
  const rel = relativeDayName(date, store, now);
  const day = rel ?? new Intl.DateTimeFormat(store.locale.default, { weekday: 'long', timeZone: store.dates.timeZone }).format(date);
  return `${day}, ${timeOfDay(date, store)}`;
}

/** "Today by 7:30 PM" / "Thursday, October 9 by 7:30 PM". */
export function byTimeText(date: Date, store: StoreDates, now: Date = new Date()): string {
  return `${relativeDayName(date, store, now) ?? longDate(date, store)} by ${timeOfDay(date, store)}`;
}

/** "Order within 2 hrs 13 mins" / "Order within 45 mins" until `by`; null when under a minute is left. */
export function orderWithinText(now: Date, by: Date): string | null {
  const mins = Math.floor((by.getTime() - now.getTime()) / 60_000);
  if (mins < 1) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const part = (n: number, unit: string) => (n ? `${n} ${unit}${n === 1 ? '' : 's'}` : '');
  return `Order within ${[part(h, 'hr'), part(m, 'min')].filter(Boolean).join(' ')}`;
}

/** Delivery window around the ETA (11:30 local): "9 AM – 1 PM". */
export function deliveryWindow(eta: Date, store: StoreDates): string {
  const from = new Date(eta.getTime() - 2.5 * 3_600_000);
  const to = new Date(eta.getTime() + 1.5 * 3_600_000);
  const hour = (d: Date) =>
    new Intl.DateTimeFormat(store.locale.default, { hour: 'numeric', timeZone: store.dates.timeZone }).format(d);
  return `${hour(from)} – ${hour(to)}`;
}

/**
 * When a cart placed now would arrive (same offset the tracking timeline uses) — from `release`
 * (ISO) instead when it holds a pre-order.
 */
export function cartEta(now: Date = new Date(), store?: StoreDates, release?: string | null): Date {
  const eta = deliveryEta({ status: 'placed', createdAt: now.toISOString(), ...(release ? { releaseAt: release } : {}) }, now, store?.dates.timeZone);
  return eta ? new Date(eta) : new Date(now.getTime() + 2 * DAY);
}

/**
 * What happened to the money on a cancelled order: "Refund of $34.06 to Visa ending 4242 ·
 * issued September 28. Card refunds take 5–10 business days to show up.", "… is processing",
 * "Nothing was charged (pay on delivery).", or "No payment was taken for this order."
 */
export function refundText(order: Order, store: StoreDates): string {
  return order.refund ? refundLine(order, order.refund, store) : 'No payment was taken for this order.';
}

/** The same for some items cancelled before the order shipped. */
export function cancellationRefundText(order: Order, c: OrderCancellation, store: StoreDates): string {
  return refundLine(order, c.refund, store);
}

function refundLine(order: Order, r: NonNullable<Order['refund']>, store: StoreDates): string {
  if (r.status === 'not_charged') return 'Nothing was charged (pay on delivery).';
  // paid partly from the balance: the payment method gets back what it paid first, the balance the rest
  const bal = r.balanceMinor ?? 0;
  const paid = r.amountMinor - bal;
  const toMethod = `${formatMoney(paid, order.currency)} to ${paymentText(order.paymentMethod, order.paymentLabel)}`;
  const toBalance = `${formatMoney(bal, order.currency)} to ${paymentText(balanceMethod(order.market), '')}`;
  if (r.status === 'succeeded') {
    const when = r.refundedAt ? ` · issued ${shortDate(new Date(r.refundedAt), store)}` : ' · issued';
    const to = !bal ? toMethod : paid > 0 ? `${toMethod} and ${toBalance}` : toBalance;
    return `Refund of ${to}${when}.${order.paymentMethod === 'card' && paid > 0 ? ' Card refunds take 5–10 business days to show up.' : ''}`;
  }
  // the balance's part is back at once; the rest waits on the payment method
  const back = bal ? `Refund of ${toBalance} · issued. ` : '';
  if (r.status === 'pending') return `${back}Refund of ${toMethod} is processing.`;
  return `${back}Your refund of ${toMethod} is delayed. We’re retrying it — no need to do anything.`;
}

/**
 * A No-Rush order's reward for the facts card: credited (and when), on its way to the balance once
 * the order has shipped (it's credited the next time the balance is read), still to come, or lost
 * to a cancellation. Null for any other order.
 */
export function noRushText(order: Order, now: Date, money: (minor: number) => string, store: StoreDates): string | null {
  const reward = order.noRushReward;
  if (order.shipSpeed !== 'no_rush' || !reward) return null;
  const amount = money(reward.amountMinor);
  if (reward.creditedAt) return `No-Rush Shipping · ${amount} reward added to your gift card balance on ${releaseDate(new Date(reward.creditedAt), store)}`;
  if (order.status === 'cancelled') return 'No-Rush Shipping · no reward, as the order was cancelled';
  if (order.status === 'placed' && order.shippedAt && Date.parse(order.shippedAt) <= now.getTime()) {
    return `No-Rush Shipping · ${amount} reward added to your gift card balance`;
  }
  return `No-Rush Shipping · ${amount} reward to your gift card balance when it ships`;
}

/** Short payment state for the facts card: "Visa ending 4242 · refunded". */
export function paidWithText(order: Order): string {
  const label = orderPaymentText(order);
  if (order.status === 'awaiting_payment') return `${label} · not paid yet`;
  // a Pay on Delivery order paid online ahead of the delivery ("Pay now")
  if (order.status !== 'cancelled') return order.prepaidAt ? `${label} · paid before delivery` : label;
  switch (order.refund?.status) {
    case 'succeeded': return `${label} · refunded`;
    case 'pending':
    case 'failed': return `${label} · refund processing`;
    default: return `${label} · not charged`;
  }
}

export type ChipTone = 'good' | 'neutral' | 'warn' | 'dark';

export interface OrderView {
  steps: TrackingStep[];
  eta: Date | null;
  delivered: boolean;
  /** dark-panel kicker: "ON TIME", "OUT FOR DELIVERY", "DELIVERED", "READY FOR PICKUP", … */
  kicker: string;
  /** big headline: "Arriving tomorrow", "Delivered", … */
  headline: string;
  /** line under the headline. */
  window: string;
  /** status chip for order lists. */
  chip: { label: string; tone: ChipTone };
  itemCount: number;
  /** the shopper may cancel until then (it ships); null once they can't. */
  cancelUntil: Date | null;
  /** shipped: the shopper may ask for it to be stopped until then (out for delivery); else null. */
  stopUntil: Date | null;
}

/** Everything the order pages say about an order's progress, derived from its time + status. */
export function orderView(order: Order, store: StoreDates, now: Date = new Date()): OrderView {
  const tz = store.dates.timeZone;
  const steps = trackingSteps(order, now, tz);
  const etaIso = deliveryEta(order, now, tz);
  const eta = etaIso ? new Date(etaIso) : null;
  const delivered = isDelivered(order, now, tz);
  const itemCount = order.items.reduce((n, i) => n + i.qty, 0);
  const current = steps.find((s) => s.state === 'current');
  const until = cancellableUntil(order, now);
  const cancelUntil = until ? new Date(until) : null;
  const stop = stoppableUntil(order, now);
  const stopUntil = stop ? new Date(stop) : null;

  if (order.status === 'cancelled') {
    const headline =
      order.cancelReason === 'sold_out' ? 'Cancelled: an item sold out'
      : order.cancelReason === 'admin' ? 'Cancelled by the store'
      : order.cancelReason === 'intercepted' ? 'Cancelled: sent back to us'
      : 'Order cancelled';
    const refunded = order.refund?.status === 'succeeded';
    return {
      steps, eta, delivered, itemCount, cancelUntil, stopUntil,
      kicker: 'CANCELLED',
      headline,
      window: refundText(order, store),
      chip: { label: refunded ? 'Cancelled · refunded' : 'Cancelled', tone: 'neutral' },
    };
  }
  if (order.status === 'awaiting_payment') {
    return {
      steps, eta, delivered, itemCount, cancelUntil, stopUntil,
      kicker: 'PAYMENT PENDING',
      headline: 'Waiting for payment',
      window: 'Complete card payment to confirm this order — unpaid orders are released.',
      chip: { label: 'Payment pending', tone: 'warn' },
    };
  }
  if (delivered && eta && order.pickup) {
    return {
      steps, eta, delivered, itemCount, cancelUntil, stopUntil,
      kicker: 'READY FOR PICKUP',
      headline: 'Ready for pickup',
      window: `At ${order.shipTo.line1} · ${stepTime(eta, store, now)}`,
      chip: { label: 'Ready for pickup', tone: 'good' },
    };
  }
  if (delivered && eta) {
    return {
      steps, eta, delivered, itemCount, cancelUntil, stopUntil,
      kicker: 'DELIVERED',
      headline: 'Delivered',
      // where it was left, when there's a spot for it; handed over otherwise
      window: `${order.shipTo.dropoff ? DROPOFF[order.shipTo.dropoff].left : `Handed to ${order.shipTo.name.split(' ')[0] || 'you'}`} · ${stepTime(eta, store, now)}`,
      chip: { label: `Delivered ${relativeDayName(eta, store, now)?.toLowerCase() ?? shortDate(eta, store)}`, tone: 'neutral' },
    };
  }
  const rel = eta ? relativeDayName(eta, store, now) : null;
  const when = eta ? (rel ? rel.toLowerCase() : longDate(eta, store)) : 'soon';
  const out = current?.label === 'Out for delivery';
  // a pre-order waits for its release, then goes as any other order
  const release = order.releaseAt && Date.parse(order.releaseAt) > now.getTime() ? new Date(order.releaseAt) : null;
  if (release) {
    return {
      steps, eta, delivered, itemCount, cancelUntil, stopUntil,
      kicker: 'PRE-ORDER',
      headline: `Arriving ${when}`,
      window: `Releases ${releaseDate(release, store)} · ships that day`,
      chip: { label: `Arriving ${when}`, tone: 'good' },
    };
  }
  return {
    steps, eta, delivered, itemCount, cancelUntil, stopUntil,
    kicker: out ? 'OUT FOR DELIVERY' : 'ON TIME',
    headline: `Arriving ${when}`,
    window: eta ? `${rel ? `${shortDate(eta, store)} · ` : ''}${deliveryWindow(eta, store)}` : '',
    chip: { label: `Arriving ${when}`, tone: 'good' },
  };
}
