import type { Db } from '../db/client';
import type { Market, PaymentMethod } from '../types';
import { DataError, unwrap } from './errors';

/**
 * Gift card balance, per shopper and store. Redeeming a gift card code or reloading it by card tops it up; paying
 * with the store balance (`giftcard` in the US, `amazonpay` in India) takes the order total
 * when the order is placed, and refunds of those orders go back to it. The database does
 * all the arithmetic (place_order fails with insufficient_balance); this module reads it.
 */

/** The payment methods paid from the store balance. */
export const BALANCE_METHODS: readonly PaymentMethod[] = ['giftcard', 'amazonpay'];

export function isBalanceMethod(method: string): boolean {
  return (BALANCE_METHODS as readonly string[]).includes(method);
}

/** The store's balance method: `amazonpay` (the wallet) in India, `giftcard` in the US. */
export function balanceMethod(market: Market): PaymentMethod {
  return market === 'IN' ? 'amazonpay' : 'giftcard';
}

export interface GiftCard {
  code: string;
  amountMinor: number;
  redeemed: boolean;
}

export interface BalanceEntry {
  id: number;
  /** positive for money in (a redeemed card, a reload, a refund), negative for an order */
  amountMinor: number;
  kind: 'gift_card' | 'order' | 'refund' | 'reload';
  orderId: string | null;
  giftCardCode: string | null;
  at: string;
}

/** "a1b2 c3d4e5 f6a7" → "A1B2-C3D4E5-F6A7"; anything that can't be a code is returned trimmed. */
export function formatGiftCode(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  const alnum = s.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return alnum.length === 14 ? `${alnum.slice(0, 4)}-${alnum.slice(4, 10)}-${alnum.slice(10)}` : s.trim();
}

/** The caller's balance in a store (0 before their first gift card), or null when it can't be read. */
export async function storeBalance(db: Db, market: Market): Promise<number | null> {
  const { data, error } = await db.from('store_balances').select('balance_minor').eq('market_id', market).maybeSingle();
  if (error) return null;
  return data?.balance_minor ?? 0;
}

/** The caller's latest balance changes in a store, newest first. */
export async function balanceHistory(db: Db, market: Market, limit = 10): Promise<BalanceEntry[]> {
  const { data, error } = await db
    .from('balance_entries')
    .select('id, amount_minor, kind, order_id, gift_card_code, created_at')
    .eq('market_id', market)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((e) => ({
    id: e.id,
    amountMinor: e.amount_minor,
    kind: e.kind as BalanceEntry['kind'],
    orderId: e.order_id,
    giftCardCode: e.gift_card_code,
    at: e.created_at,
  }));
}

/** The caller's demo gift card for this store, issued the first time (one per account and store). */
export async function claimDemoGiftCard(db: Db, market: Market): Promise<GiftCard> {
  const json = unwrap(await db.rpc('claim_demo_gift_card', { p_market: market })) as { code: string; amount_minor: number; redeemed: boolean };
  return { code: json.code, amountMinor: json.amount_minor, redeemed: json.redeemed };
}

/** The demo card issued to this shopper in this store, if they've claimed one (without issuing it). */
export async function demoGiftCard(db: Db, market: Market, userId: string): Promise<GiftCard | null> {
  const { data, error } = await db.from('gift_cards').select('code, amount_minor, redeemed_at').eq('market_id', market).eq('issued_to', userId).maybeSingle();
  if (error || !data) return null;
  return { code: data.code, amountMinor: data.amount_minor, redeemed: data.redeemed_at !== null };
}

/** Redeem a code into the caller's balance in this store. */
export async function redeemGiftCard(db: Db, market: Market, code: unknown): Promise<{ amountMinor: number; balanceMinor: number }> {
  const raw = typeof code === 'string' ? code.trim() : '';
  if (!raw) throw new DataError('invalid_input', 'code', 'Enter the gift card code.');
  const json = unwrap(await db.rpc('redeem_gift_card', { p_market: market, p_code: raw })) as { amount_minor: number; balance_minor: number };
  return { amountMinor: json.amount_minor, balanceMinor: json.balance_minor };
}

/** What this store's demo gift card is worth, or null before gift card balances exist. */
export async function demoGiftCardAmount(db: Db, market: Market): Promise<number | null> {
  const { data, error } = await db.from('markets').select('demo_gift_card_minor').eq('id', market).maybeSingle();
  return error || !data ? null : data.demo_gift_card_minor;
}
