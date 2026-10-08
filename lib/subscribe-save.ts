/**
 * Subscribe & Save, as on Amazon: a product delivered every 1 to 6 months, 5% off each item, 15%
 * when 5 or more subscriptions arrive in the same delivery, always delivered free. The database
 * places the deliveries and works out the money (private.sns_pct, private.sns_unit_discount); this
 * says it, and groups a shopper's subscriptions into the deliveries they'll arrive in.
 */
import type { PaymentMethod, Subscription, SubscriptionIssue } from './types';

/** the discount, and the bigger one for a delivery of at least SNS_MANY subscriptions */
export const SNS_PCT = 5;
export const SNS_PCT_MANY = 15;
export const SNS_MANY = 5;

/** how often a delivery can come, in months (subscriptions_every_months_check) */
export const SNS_FREQUENCIES = [1, 2, 3, 4, 5, 6] as const;
/** how many a delivery can hold (subscriptions_qty_check) */
export const SNS_MAX_QTY = 10;

/** "Every month", "Every 2 months" */
export function frequencyLabel(months: number): string {
  return months === 1 ? 'Every month' : `Every ${months} months`;
}

/** The percent off each item of a delivery of this many subscriptions. */
export function snsPct(subscriptions: number): number {
  return subscriptions >= SNS_MANY ? SNS_PCT_MANY : SNS_PCT;
}

/** What Subscribe & Save takes off one unit at this price (rounded down, as the database does). */
export function snsUnitMinor(priceMinor: number, pct: number): number {
  return Math.floor((priceMinor * pct) / 100);
}

/** A product's Subscribe & Save price at the usual 5%. */
export function snsPriceMinor(priceMinor: number, pct = SNS_PCT): number {
  return priceMinor - snsUnitMinor(priceMinor, pct);
}

/** One delivery: the active subscriptions due on the same day, to the same address, paid the same way. */
export interface Delivery {
  on: string;
  addressId?: string;
  paymentMethod: PaymentMethod;
  subscriptions: Subscription[];
  pct: number;
}

/**
 * The upcoming deliveries of a shopper's subscriptions, soonest first, as the store will place
 * them (one order per day, address and payment method), each with the percent it saves.
 */
export function deliveries(subs: readonly Subscription[]): Delivery[] {
  const byKey = new Map<string, Delivery>();
  for (const s of subs) {
    if (s.status !== 'active') continue;
    const key = `${s.nextOn}|${s.addressId ?? ''}|${s.paymentMethod}`;
    const d = byKey.get(key);
    if (d) d.subscriptions.push(s);
    else byKey.set(key, { on: s.nextOn, addressId: s.addressId, paymentMethod: s.paymentMethod, subscriptions: [s], pct: 0 });
  }
  return [...byKey.values()]
    .map((d) => ({ ...d, pct: snsPct(d.subscriptions.length) }))
    .sort((a, b) => a.on.localeCompare(b.on) || (a.addressId ?? '').localeCompare(b.addressId ?? '') || a.paymentMethod.localeCompare(b.paymentMethod));
}

/** How many more subscriptions a delivery needs for the bigger discount (0 once it has it). */
export function snsShortfall(delivery: Pick<Delivery, 'subscriptions'>): number {
  return Math.max(0, SNS_MANY - delivery.subscriptions.length);
}

/** Why a delivery didn't go, as the manage page says it. */
export function issueText(kind: SubscriptionIssue): string {
  switch (kind) {
    case 'out_of_stock': return 'Your last delivery was skipped: this item was out of stock.';
    case 'unavailable': return 'Your last delivery was skipped: this item is no longer available with Subscribe & Save.';
    case 'address': return 'Your last delivery was skipped: its address was removed. Choose another to get the next one.';
    case 'payment': return 'Your last delivery was skipped: the payment didn’t go through. Add to your balance or choose another payment method.';
  }
}

/**
 * A store date (YYYY-MM-DD) as a moment on that day in either store's time zone (noon UTC is the
 * same date in Los Angeles and in Kolkata), for the store's date formatters.
 */
export function storeDay(on: string): Date {
  return new Date(`${on}T12:00:00Z`);
}

/** What each subscription payment method is called, on the set-up and manage pages. */
export const SNS_METHOD_LABEL: Partial<Record<PaymentMethod, string>> = {
  giftcard: 'Gift card balance',
  upi: 'UPI',
  netbanking: 'Net banking',
  amazonpay: 'Wallet balance',
};

export function isSubscribeMethod(m: string, methods: readonly string[]): m is PaymentMethod {
  return methods.includes(m);
}
