import type { CurrencyCode } from '../contracts';
import type { Db } from '../db/client';
import { formatMoney } from '../marketplaces';
import type { Market } from '../types';
import { DataError, unwrap } from './errors';

/**
 * Buying gift cards. The database records the purchase as awaiting payment; the shopper pays by
 * card on Stripe hosted Checkout (lib/data/payments.ts), and only a session Stripe reports as
 * paid issues the code. Bought codes can be given away or redeemed into the buyer's own balance.
 * A reload ("Reload Your Balance") is paid the same way and goes straight onto the buyer's balance.
 */

/** What a store sells, in minor units; whole currency units only (the database checks the same). */
export const GIFT_CARD_LIMITS: Record<Market, { minMinor: number; maxMinor: number }> = {
  US: { minMinor: 100, maxMinor: 200_000 },
  IN: { minMinor: 1_000, maxMinor: 1_000_000 },
};
export const RECIPIENT_MAX = 60;
export const GIFT_MESSAGE_MAX = 240;
const CURRENCY: Record<Market, CurrencyCode> = { US: 'USD', IN: 'INR' };

/** "$50" rather than "$50.00": gift cards come in whole amounts. */
export function wholeMoney(minor: number, currency: CurrencyCode): string {
  return formatMoney(minor, currency).replace(/\.00$/, '');
}

export interface GiftCardPurchase {
  id: string;
  market: Market;
  amountMinor: number;
  currency: string;
  recipientName: string | null;
  message: string | null;
  status: 'awaiting_payment' | 'paid';
  /** set once paid */
  code: string | null;
  redeemed: boolean;
  /** a reload of the buyer's own balance: no code, no recipient */
  reload: boolean;
  createdAt: string;
  paidAt: string | null;
}

export interface PurchaseRow {
  id: string;
  market_id: string;
  amount_minor: number;
  currency: string;
  recipient_name: string | null;
  message: string | null;
  status: string;
  code: string | null;
  redeemed: boolean;
  /** absent before the balance-reload migration */
  reload?: boolean;
  created_at: string;
  paid_at: string | null;
}

export function toPurchase(r: PurchaseRow): GiftCardPurchase {
  return {
    id: r.id,
    market: r.market_id as Market,
    amountMinor: r.amount_minor,
    currency: r.currency,
    recipientName: r.recipient_name,
    message: r.message,
    status: r.status === 'paid' ? 'paid' : 'awaiting_payment',
    code: r.code,
    redeemed: r.redeemed,
    reload: r.reload ?? false,
    createdAt: r.created_at,
    paidAt: r.paid_at,
  };
}

export interface PurchaseInput {
  amountMinor: unknown;
  recipientName?: unknown;
  message?: unknown;
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Checks a purchase before it reaches the database, with messages a shopper can act on. */
export function checkPurchase(market: Market, input: PurchaseInput) {
  const { minMinor, maxMinor } = GIFT_CARD_LIMITS[market];
  const format = (minor: number) => wholeMoney(minor, CURRENCY[market]);
  const amount = typeof input.amountMinor === 'number' ? input.amountMinor : Number.NaN;
  if (!Number.isInteger(amount) || amount % 100 !== 0 || amount < minMinor || amount > maxMinor) {
    throw new DataError('invalid_input', 'amount', `Choose a whole amount from ${format(minMinor)} to ${format(maxMinor)}.`);
  }
  const recipientName = text(input.recipientName);
  if (recipientName.length > RECIPIENT_MAX) throw new DataError('invalid_input', 'recipient', `Keep the name under ${RECIPIENT_MAX} characters.`);
  const message = text(input.message);
  if (message.length > GIFT_MESSAGE_MAX) throw new DataError('invalid_input', 'message', `Keep the message under ${GIFT_MESSAGE_MAX} characters.`);
  return { amountMinor: amount, recipientName: recipientName || null, message: message || null };
}

/** Record a gift card purchase awaiting payment (signed in). */
export async function startGiftCardPurchase(db: Db, market: Market, input: PurchaseInput): Promise<GiftCardPurchase> {
  const p = checkPurchase(market, input);
  const row = unwrap(
    await db.rpc('start_gift_card_purchase', {
      p_market: market,
      p_amount_minor: p.amountMinor,
      p_recipient: p.recipientName ?? undefined,
      p_message: p.message ?? undefined,
    }),
  ) as unknown as PurchaseRow;
  return toPurchase(row);
}

/** Record a reload of the caller's balance awaiting payment (signed in), within the gift card limits. */
export async function startBalanceReload(db: Db, market: Market, amountMinor: unknown): Promise<GiftCardPurchase> {
  const p = checkPurchase(market, { amountMinor });
  const row = unwrap(await db.rpc('start_balance_reload', { p_market: market, p_amount_minor: p.amountMinor })) as unknown as PurchaseRow;
  return toPurchase(row);
}

/** The caller's paid gift card purchases and reloads in a store, newest first (empty before the migration). */
export async function listGiftCardPurchases(db: Db, market: Market, limit = 20): Promise<GiftCardPurchase[]> {
  const res = await db.rpc('my_gift_card_purchases', { p_market: market, p_limit: limit });
  if (res.error) return [];
  return ((res.data ?? []) as unknown as PurchaseRow[]).map(toPurchase);
}
