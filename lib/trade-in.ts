import type { ExchangeCondition } from './exchange';
import type { Market } from './types';

/**
 * Trade-In, as on amazon.com (a demo: nothing is shipped): the shopper picks an old phone or
 * laptop from the store's list (the models the store takes, `exchange_devices`), says what state
 * it's in and gets a quote. They send it within 7 days with the prepaid label, and when it arrives
 * the store checks it and pays the quote into their balance as gift card credit — what it's worth
 * as it came if that's less, nothing (it's sent back) if it isn't the device or doesn't switch on.
 */

export type TradeInStatus = 'open' | 'credited' | 'cancelled' | 'rejected';

/** days to send the device once quoted */
export const TRADE_IN_SHIP_DAYS = 7;
/** trade-ins a shopper can have waiting to be sent at once */
export const TRADE_IN_OPEN_LIMIT = 5;

/** Only amazon.com runs Trade-In; amazon.in takes old devices in exchange on a new one instead. */
export function hasTradeIn(market: Market): boolean {
  return market === 'US';
}

/** What a device worth `goodMinor` with an undamaged screen is worth in a condition: half with a damaged screen (rounded down). Mirrors `private.trade_in_value`. */
export function tradeInValue(goodMinor: number, condition: ExchangeCondition): number {
  return condition === 'good' ? goodMinor : Math.floor(goodMinor / 2);
}

/** What the store pays for a trade-in that arrives in `received`: its value then, never more than the quote. */
export function tradeInCredit(goodMinor: number, quoteMinor: number, received: ExchangeCondition): number {
  return Math.min(quoteMinor, tradeInValue(goodMinor, received));
}

export const TRADE_IN_STATUS_LABEL: Record<TradeInStatus, string> = {
  open: 'Waiting for your device',
  credited: 'Credited',
  cancelled: 'Cancelled',
  rejected: 'Sent back',
};
