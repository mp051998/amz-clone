import type { Db } from '../db/client';
import { isExchangeCondition, isExchangeKind, type ExchangeCondition, type ExchangeKind } from '../exchange';
import type { TradeInStatus } from '../trade-in';
import type { Market } from '../types';
import type { AdminCustomer } from './admin-orders';
import { unwrap } from './errors';

/**
 * Trade-In (amazon.com; lib/trade-in.ts): the shopper's trade-ins, and the admin queue. The
 * database quotes a device, keeps the trade-in and, when the store receives it, pays the credit
 * into the shopper's balance (supabase/migrations/20270123090000_trade_in.sql).
 */

export interface TradeIn {
  id: string;
  /** null once the store stops listing the model */
  deviceId: string | null;
  /** "Apple iPhone 14" */
  device: string;
  kind: ExchangeKind;
  /** what the shopper said, and what that's worth */
  condition: ExchangeCondition;
  quoteMinor: number;
  /** what the model was worth with an undamaged screen when quoted */
  goodMinor: number;
  status: TradeInStatus;
  /** the prepaid label's code */
  shipCode: string;
  shipBy: string;
  /** credited: what the store found, and paid */
  receivedCondition?: ExchangeCondition;
  creditedMinor?: number;
  /** sent back: the store's note */
  rejectNote?: string;
  createdAt: string;
  /** credited, cancelled or sent back */
  closedAt?: string;
}

export interface AdminTradeIn extends TradeIn {
  market: Market;
  customer: AdminCustomer;
}

export type AdminTradeInFilter = 'open' | 'closed' | 'all';
export const ADMIN_TRADE_IN_FILTERS: readonly AdminTradeInFilter[] = ['open', 'closed', 'all'];

export function tradeInFilter(v: unknown): AdminTradeInFilter {
  return (ADMIN_TRADE_IN_FILTERS as readonly unknown[]).includes(v) ? (v as AdminTradeInFilter) : 'open';
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const STATUSES: readonly TradeInStatus[] = ['open', 'credited', 'cancelled', 'rejected'];

export function toTradeIn(r: Row): TradeIn {
  const received = r.received_condition;
  return {
    id: String(r.id),
    deviceId: str(r.device_id) ?? null,
    device: String(r.device_name ?? ''),
    kind: isExchangeKind(r.kind) ? r.kind : 'phone',
    condition: isExchangeCondition(r.condition) ? r.condition : 'good',
    quoteMinor: num(r.quote_minor),
    goodMinor: num(r.good_minor),
    status: (STATUSES as readonly unknown[]).includes(r.status) ? (r.status as TradeInStatus) : 'open',
    shipCode: String(r.ship_code ?? ''),
    shipBy: String(r.ship_by ?? ''),
    ...(isExchangeCondition(received) ? { receivedCondition: received } : {}),
    ...(r.credited_minor != null ? { creditedMinor: num(r.credited_minor) } : {}),
    ...(str(r.reject_note) ? { rejectNote: str(r.reject_note) } : {}),
    createdAt: String(r.created_at ?? ''),
    ...(str(r.closed_at) ? { closedAt: str(r.closed_at) } : {}),
  };
}

function toAdminTradeIn(r: Row): AdminTradeIn {
  const c = (r.customer ?? {}) as Row;
  return {
    ...toTradeIn(r),
    market: r.market_id === 'IN' ? 'IN' : 'US',
    customer: { id: str(c.id), email: str(c.email) ?? null, name: str(c.name) ?? null },
  };
}

/** The caller's trade-ins in a store, newest first. */
export async function listTradeIns(db: Db, market: Market, limit = 50): Promise<TradeIn[]> {
  const rows = unwrap(
    await db
      .from('trade_ins')
      .select('id, device_id, device_name, kind, condition, quote_minor, good_minor, status, ship_code, ship_by, received_condition, credited_minor, reject_note, created_at, closed_at')
      .eq('market_id', market)
      .order('created_at', { ascending: false })
      .limit(limit),
  ) as Row[];
  return rows.map(toTradeIn);
}

/**
 * Trade in one of the store's models in a condition (`422 invalid_input`, detail device |
 * condition; `409 trade_in_limit` with 5 waiting to be sent). Returns the trade-in, with its quote
 * and label code.
 */
export async function requestTradeIn(db: Db, deviceId: string, condition: ExchangeCondition): Promise<TradeIn> {
  return toTradeIn(unwrap(await db.rpc('request_trade_in', { p_device: deviceId, p_condition: condition })) as Row);
}

/** Cancel one of the caller's trade-ins before it's sent (`409 trade_in_closed`, `404 trade_in_not_found`). */
export async function cancelTradeIn(db: Db, id: string): Promise<TradeIn> {
  return toTradeIn(unwrap(await db.rpc('cancel_trade_in', { p_id: id })) as Row);
}

export interface AdminTradeInList {
  counts: Record<AdminTradeInFilter, number>;
  tradeIns: AdminTradeIn[];
}

/** One store's trade-ins for an admin: open ones oldest first, the rest newest first (the latest 200). */
export async function listAdminTradeIns(db: Db, market: Market, filter: AdminTradeInFilter = 'open'): Promise<AdminTradeInList> {
  const json = unwrap(await db.rpc('admin_list_trade_ins', { p_market: market, p_filter: filter })) as Row | null;
  const counts = (json?.counts ?? {}) as Row;
  return {
    counts: { open: num(counts.open), closed: num(counts.closed), all: num(counts.all) },
    tradeIns: ((json?.trade_ins ?? []) as Row[]).map(toAdminTradeIn),
  };
}

/**
 * A store's trade-in arrived, in `condition`: pays what it's worth as it came, never more than the
 * quote, into the shopper's balance. `trade_in_not_found` in another store, `trade_in_closed` unless it's open.
 */
export async function receiveTradeIn(db: Db, market: Market, id: string, condition: ExchangeCondition): Promise<AdminTradeIn> {
  return toAdminTradeIn(unwrap(await db.rpc('admin_receive_trade_in', { p_id: id, p_market: market, p_condition: condition })) as Row);
}

/** A store's trade-in isn't the device, or doesn't switch on: sent back, with a note (errors as receiveTradeIn). */
export async function rejectTradeIn(db: Db, market: Market, id: string, note?: unknown): Promise<AdminTradeIn> {
  const text = typeof note === 'string' ? note.trim().slice(0, 500) : '';
  return toAdminTradeIn(unwrap(await db.rpc('admin_reject_trade_in', { p_id: id, p_market: market, ...(text ? { p_note: text } : {}) })) as Row);
}
