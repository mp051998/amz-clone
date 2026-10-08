/**
 * Exchange offers, as on amazon.in ("With Exchange: Up to ₹X off"): buying one phone or laptop
 * with Buy Now, the shopper trades in an old one of the same kind, picked from the store's list,
 * and its value comes off the new one. The old one is collected when the order is delivered.
 */

export type ExchangeKind = 'phone' | 'laptop';
/** `good`: switches on, screen undamaged; `screen_damaged`: switches on, screen cracked or marked (half the value) */
export type ExchangeCondition = 'good' | 'screen_damaged';

export const EXCHANGE_CONDITIONS: readonly ExchangeCondition[] = ['good', 'screen_damaged'];

export const CONDITION_LABEL: Record<ExchangeCondition, string> = {
  good: 'Switches on, screen undamaged',
  screen_damaged: 'Switches on, screen cracked or marked',
};

export const KIND_LABEL: Record<ExchangeKind, string> = { phone: 'phone', laptop: 'laptop' };

/** A model the store takes in exchange, and what it's worth working with an undamaged screen. */
export interface ExchangeDevice {
  id: string;
  kind: ExchangeKind;
  brand: string;
  model: string;
  valueMinor: number;
}

/** What the shopper picked to trade in (Buy Now's `exchange` and `condition`). */
export interface ExchangeChoice {
  deviceId: string;
  condition: ExchangeCondition;
}

export function isExchangeKind(v: unknown): v is ExchangeKind {
  return v === 'phone' || v === 'laptop';
}

export function isExchangeCondition(v: unknown): v is ExchangeCondition {
  return v === 'good' || v === 'screen_damaged';
}

/**
 * What a device takes off one unit priced `priceMinor` (before its other discounts): its value, half
 * with a damaged screen (rounded down), up to half the price. Mirrors `private.exchange_value`.
 */
export function exchangeValue(valueMinor: number, condition: ExchangeCondition, priceMinor: number): number {
  const worth = condition === 'good' ? valueMinor : Math.floor(valueMinor / 2);
  return Math.max(0, Math.min(worth, Math.floor(priceMinor / 2)));
}

/** "Up to" for a product: the most any device of its kind takes off it (0 with none). */
export function exchangeUpTo(devices: readonly ExchangeDevice[], priceMinor: number): number {
  return devices.reduce((best, d) => Math.max(best, exchangeValue(d.valueMinor, 'good', priceMinor)), 0);
}

/** The device and condition from a form or query string; null unless both are there and the condition is known. */
export function readExchange(deviceId: unknown, condition: unknown): ExchangeChoice | null {
  const id = typeof deviceId === 'string' ? deviceId.trim() : '';
  if (!id || id.length > 60 || !isExchangeCondition(condition)) return null;
  return { deviceId: id, condition };
}

/** "Apple iPhone 13 (switches on, screen undamaged)". */
export function exchangeText(device: string, condition: ExchangeCondition): string {
  return `${device} (${CONDITION_LABEL[condition].toLowerCase()})`;
}
