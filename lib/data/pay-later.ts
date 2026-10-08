import type { Db } from '../db/client';
import type { Market } from '../types';
import { unwrap } from './errors';
import type { Transaction } from './transactions';

/**
 * Pay Later, as amazon.in's Amazon Pay Later (a demo: no credit check, and nothing is lent or
 * billed for real). The database keeps the account and works out what's owed and billed from the
 * shopper's Pay Later orders, their refunds and the repayments; it also turns down a Pay Later
 * order that the account can't pay for. This module reads and changes the account.
 */

export interface PayLater {
  /** the store it's for (amazon.in) */
  market: Market;
  /** when it was activated (ISO timestamp) */
  activatedAt: string;
  limitMinor: number;
  /** what's owed: bought with Pay Later, less refunds and repayments */
  usedMinor: number;
  /** refunds of what was already repaid; the next purchases use it up first */
  creditMinor: number;
  /** how much of the limit is free to spend */
  availableMinor: number;
  /** the latest bill (made on the 1st) still to pay */
  billMinor: number;
  /** owed but not billed yet: bought since the 1st */
  unbilledMinor: number;
  /** when the bill is due (YYYY-MM-DD, the 5th); absent with no bill to pay */
  dueOn?: string;
  /** the bill wasn't paid by its due date: Pay Later can't be used until it is */
  overdue: boolean;
}

/** How a repayment is made (a demo: nothing is taken). */
export type RepayMethod = 'upi' | 'netbanking';

export const REPAY_METHODS: readonly RepayMethod[] = ['upi', 'netbanking'];

export function isRepayMethod(v: unknown): v is RepayMethod {
  return v === 'upi' || v === 'netbanking';
}

export interface PayLaterRepayment {
  id: string;
  amountMinor: number;
  method: RepayMethod;
  /** net banking: the bank */
  bank?: string;
  at: string;
}

/** A line of Pay Later activity: a purchase, a refund of one, or a repayment. */
export interface PayLaterActivity {
  key: string;
  kind: 'purchase' | 'refund' | 'repayment';
  amountMinor: number;
  at: string;
  orderId?: string;
  /** a repayment: how it was paid */
  repayment?: Pick<PayLaterRepayment, 'method' | 'bank'>;
}

type Row = {
  market_id?: string;
  activated_at: string;
  limit_minor: number;
  used_minor: number;
  credit_minor: number;
  available_minor: number;
  bill_minor: number;
  unbilled_minor: number;
  due_on: string | null;
  overdue: boolean;
};

function toPayLater(row: Row): PayLater {
  return {
    market: row.market_id === 'US' ? 'US' : 'IN',
    activatedAt: row.activated_at,
    limitMinor: row.limit_minor,
    usedMinor: row.used_minor,
    creditMinor: row.credit_minor,
    availableMinor: row.available_minor,
    billMinor: row.bill_minor,
    unbilledMinor: row.unbilled_minor,
    ...(row.due_on ? { dueOn: row.due_on } : {}),
    overdue: row.overdue,
  };
}

/** The caller's Pay Later account, or null when they haven't activated it. */
export async function payLater(db: Db): Promise<PayLater | null> {
  const row = unwrap(await db.rpc('pay_later')) as Row | null;
  return row ? toPayLater(row) : null;
}

/**
 * Activate Pay Later in a store that offers it (`422 pay_later_unavailable` where it isn't), with
 * that store's limit. Activating again changes nothing.
 */
export async function activatePayLater(db: Db, market: Market): Promise<PayLater> {
  return toPayLater(unwrap(await db.rpc('activate_pay_later', { p_market: market })) as Row);
}

/**
 * Repay some or all of what's owed (`422 invalid_input`, detail "amount", for more than that or
 * nothing; `409 pay_later_inactive` without an account). Net banking can name the bank.
 */
export async function repayPayLater(db: Db, amountMinor: number, method: RepayMethod, bank?: string): Promise<PayLater> {
  return toPayLater(
    unwrap(await db.rpc('repay_pay_later', { p_amount: amountMinor, p_method: method, ...(bank ? { p_bank: bank } : {}) })) as Row,
  );
}

/** The caller's repayments, newest first. */
export async function listPayLaterRepayments(db: Db, limit = 50): Promise<PayLaterRepayment[]> {
  const rows = unwrap(
    await db.from('pay_later_repayments').select('id, amount_minor, method, bank, created_at').order('created_at', { ascending: false }).limit(limit),
  ) as { id: string; amount_minor: number; method: string; bank: string | null; created_at: string }[];
  return rows.map((r) => ({
    id: r.id,
    amountMinor: r.amount_minor,
    method: r.method === 'netbanking' ? 'netbanking' : 'upi',
    ...(r.bank ? { bank: r.bank } : {}),
    at: r.created_at,
  }));
}

/**
 * Pay Later activity, newest first: the store's Pay Later charges and refunds (from "Your
 * transactions") with the repayments. A refund still pending isn't back on the account yet.
 */
export function payLaterActivity(transactions: Transaction[], repayments: PayLaterRepayment[]): PayLaterActivity[] {
  const lines: PayLaterActivity[] = [
    ...transactions
      .filter((t) => t.method === 'paylater' && t.status === 'completed')
      .map((t): PayLaterActivity => ({
        key: t.key,
        kind: t.kind === 'charge' ? 'purchase' : 'refund',
        amountMinor: t.amountMinor,
        at: t.at,
        ...(t.orderId ? { orderId: t.orderId } : {}),
      })),
    ...repayments.map((r): PayLaterActivity => ({
      key: `repayment:${r.id}`,
      kind: 'repayment',
      amountMinor: r.amountMinor,
      at: r.at,
      repayment: { method: r.method, ...(r.bank ? { bank: r.bank } : {}) },
    })),
  ];
  return lines.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** The limit a store gives on activating Pay Later, or null when it doesn't offer it. */
export async function payLaterOffer(db: Db, market: Market): Promise<number | null> {
  const { data, error } = await db.from('markets').select('pay_later_limit_minor').eq('id', market).maybeSingle();
  return error || !data ? null : data.pay_later_limit_minor;
}

/** When the next bill is made (YYYY-MM-DD): the 1st of next month in the store's time zone. */
export function nextBillOn(now: Date, timeZone: string): string {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).format(now).split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}
