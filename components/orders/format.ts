import type { Store } from '../lib/store';
import type { Order } from '@/lib/types';
import type { TrackingStep } from '@/lib/decision/types';
import { cancellableUntil, deliveryEta, isDelivered, trackingSteps } from '@/lib/decision/tracking';
import { formatMoney } from '@/lib/marketplaces';

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
  return label;
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

/** "Sunday, September 28" (US) / "Sunday, 28 September" (IN). */
export function longDate(date: Date, store: StoreDates): string {
  return new Intl.DateTimeFormat(store.locale.default, { weekday: 'long', day: 'numeric', month: 'long', timeZone: store.dates.timeZone }).format(date);
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

/** Delivery window around the ETA (11:30 local): "9 AM – 1 PM". */
export function deliveryWindow(eta: Date, store: StoreDates): string {
  const from = new Date(eta.getTime() - 2.5 * 3_600_000);
  const to = new Date(eta.getTime() + 1.5 * 3_600_000);
  const hour = (d: Date) =>
    new Intl.DateTimeFormat(store.locale.default, { hour: 'numeric', timeZone: store.dates.timeZone }).format(d);
  return `${hour(from)} – ${hour(to)}`;
}

/** When a cart placed now would arrive (same offset the tracking timeline uses). */
export function cartEta(now: Date = new Date(), store?: StoreDates): Date {
  const eta = deliveryEta({ status: 'placed', createdAt: now.toISOString() }, now, store?.dates.timeZone);
  return eta ? new Date(eta) : new Date(now.getTime() + 2 * DAY);
}

/**
 * What happened to the money on a cancelled order: "Refund of $34.06 to Visa ending 4242 ·
 * issued September 28. Card refunds take 5–10 business days to show up.", "… is processing",
 * "Nothing was charged (pay on delivery).", or "No payment was taken for this order."
 */
export function refundText(order: Order, store: StoreDates): string {
  const r = order.refund;
  if (!r) return 'No payment was taken for this order.';
  if (r.status === 'not_charged') return 'Nothing was charged (pay on delivery).';
  const to = `${formatMoney(r.amountMinor, order.currency)} to ${paymentText(order.paymentMethod, order.paymentLabel)}`;
  if (r.status === 'succeeded') {
    const when = r.refundedAt ? ` · issued ${shortDate(new Date(r.refundedAt), store)}` : ' · issued';
    return `Refund of ${to}${when}.${order.paymentMethod === 'card' ? ' Card refunds take 5–10 business days to show up.' : ''}`;
  }
  if (r.status === 'pending') return `Refund of ${to} is processing.`;
  return `Your refund of ${to} is delayed. We’re retrying it — no need to do anything.`;
}

/** Short payment state for the facts card: "Visa ending 4242 · refunded". */
export function paidWithText(order: Order): string {
  const label = paymentText(order.paymentMethod, order.paymentLabel);
  if (order.status === 'awaiting_payment') return `${label} · not paid yet`;
  if (order.status !== 'cancelled') return label;
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
  /** dark-panel kicker: "ON TIME", "OUT FOR DELIVERY", "DELIVERED", … */
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

  if (order.status === 'cancelled') {
    const headline =
      order.cancelReason === 'sold_out' ? 'Cancelled: an item sold out'
      : order.cancelReason === 'admin' ? 'Cancelled by the store'
      : 'Order cancelled';
    const refunded = order.refund?.status === 'succeeded';
    return {
      steps, eta, delivered, itemCount, cancelUntil,
      kicker: 'CANCELLED',
      headline,
      window: refundText(order, store),
      chip: { label: refunded ? 'Cancelled · refunded' : 'Cancelled', tone: 'neutral' },
    };
  }
  if (order.status === 'awaiting_payment') {
    return {
      steps, eta, delivered, itemCount, cancelUntil,
      kicker: 'PAYMENT PENDING',
      headline: 'Waiting for payment',
      window: 'Complete card payment to confirm this order — unpaid orders are released.',
      chip: { label: 'Payment pending', tone: 'warn' },
    };
  }
  if (delivered && eta) {
    return {
      steps, eta, delivered, itemCount, cancelUntil,
      kicker: 'DELIVERED',
      headline: 'Delivered',
      window: `Handed to ${order.shipTo.name.split(' ')[0] || 'you'} · ${stepTime(eta, store, now)}`,
      chip: { label: `Delivered ${relativeDayName(eta, store, now)?.toLowerCase() ?? shortDate(eta, store)}`, tone: 'neutral' },
    };
  }
  const rel = eta ? relativeDayName(eta, store, now) : null;
  const when = eta ? (rel ? rel.toLowerCase() : longDate(eta, store)) : 'soon';
  const out = current?.label === 'Out for delivery';
  return {
    steps, eta, delivered, itemCount, cancelUntil,
    kicker: out ? 'OUT FOR DELIVERY' : 'ON TIME',
    headline: `Arriving ${when}`,
    window: eta ? `${rel ? `${shortDate(eta, store)} · ` : ''}${deliveryWindow(eta, store)}` : '',
    chip: { label: `Arriving ${when}`, tone: 'good' },
  };
}
