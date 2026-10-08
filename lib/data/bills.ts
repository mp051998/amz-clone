import type { Db } from '../db/client';
import type { Market } from '../types';
import { isBillCategory, type BillCategory, type BillMethod } from '../bills';
import { DataError, unwrap } from './errors';

/**
 * Bill payments (amazon.in; a demo: no biller is reached, and nothing is paid or charged). The
 * database keeps the billers and the shopper's payments: fetch_bill() makes up this month's bill
 * for an account (the same every time), and pay_bill() checks a payment, takes it from the store
 * balance when that pays, and records it.
 */

export interface Biller {
  id: string;
  category: BillCategory;
  name: string;
  /** what the biller calls the account ("Consumer number") */
  accountLabel: string;
  /** what one looks like ("12 digits") */
  accountHint: string;
  /** an account, tidied (`billAccount`), matches this */
  accountPattern: string;
  /** sends a bill, paid in full once a month; otherwise the shopper chooses the amount */
  fetches: boolean;
  minMinor: number;
  maxMinor: number;
}

/** This month's bill for an account with a biller that sends bills. */
export interface Bill {
  billerId: string;
  account: string;
  /** the month it's for: its 1st ("2026-10-01") */
  period: string;
  amountMinor: number;
  /** the 20th of that month */
  dueOn: string;
  overdue: boolean;
  /** the caller's payment of it, when they've paid it */
  paid?: { id: string; amountMinor: number; at: string };
}

export interface BillPayment {
  id: string;
  billerId: string;
  category: BillCategory;
  billerName: string;
  account: string;
  /** a bill's month (its 1st); absent for a biller the shopper chose the amount for */
  period?: string;
  amountMinor: number;
  method: BillMethod;
  /** net banking: the bank */
  bank?: string;
  at: string;
}

type BillerRow = {
  id: string;
  category: string;
  name: string;
  account_label: string;
  account_hint: string;
  account_pattern: string;
  fetches: boolean;
  min_minor: number;
  max_minor: number;
};

type BillJson = {
  biller_id: string;
  account: string;
  period: string;
  amount_minor: number;
  due_on: string;
  overdue: boolean;
  paid: { id: string; amount_minor: number; created_at: string } | null;
};

type PaymentRow = {
  id: string;
  biller_id: string;
  category: string;
  biller_name: string;
  account: string;
  period: string | null;
  amount_minor: number;
  method: string;
  bank: string | null;
  created_at: string;
};

const BILLER_COLUMNS = 'id, category, name, account_label, account_hint, account_pattern, fetches, min_minor, max_minor';
const PAYMENT_COLUMNS = 'id, biller_id, category, biller_name, account, period, amount_minor, method, bank, created_at';

function toBiller(r: BillerRow): Biller {
  return {
    id: r.id,
    category: isBillCategory(r.category) ? r.category : 'electricity',
    name: r.name,
    accountLabel: r.account_label,
    accountHint: r.account_hint,
    accountPattern: r.account_pattern,
    fetches: r.fetches,
    minMinor: r.min_minor,
    maxMinor: r.max_minor,
  };
}

function toBill(r: BillJson): Bill {
  return {
    billerId: r.biller_id,
    account: r.account,
    period: r.period,
    amountMinor: r.amount_minor,
    dueOn: r.due_on,
    overdue: r.overdue,
    ...(r.paid ? { paid: { id: r.paid.id, amountMinor: r.paid.amount_minor, at: r.paid.created_at } } : {}),
  };
}

function toPayment(r: PaymentRow): BillPayment {
  return {
    id: r.id,
    billerId: r.biller_id,
    category: isBillCategory(r.category) ? r.category : 'electricity',
    billerName: r.biller_name,
    account: r.account,
    ...(r.period ? { period: r.period } : {}),
    amountMinor: r.amount_minor,
    method: r.method === 'amazonpay' || r.method === 'netbanking' ? r.method : 'upi',
    ...(r.bank ? { bank: r.bank } : {}),
    at: r.created_at,
  };
}

/** A store's billers (none outside amazon.in), a category's only when given, by name. */
export async function listBillers(db: Db, market: Market, category?: BillCategory): Promise<Biller[]> {
  let q = db.from('billers').select(BILLER_COLUMNS).eq('market_id', market).eq('active', true);
  if (category) q = q.eq('category', category);
  const rows = unwrap(await q.order('name', { ascending: true })) as BillerRow[];
  return rows.map(toBiller);
}

/**
 * This month's bill for `account` with a biller that sends bills (anyone may look; `paid` is the
 * caller's own payment). `422 invalid_input`, detail biller | account, for a biller that doesn't
 * send bills or an account that isn't one of its.
 */
export async function fetchBill(db: Db, billerId: string, account: string): Promise<Bill> {
  return toBill(unwrap(await db.rpc('fetch_bill', { p_biller: billerId, p_account: account })) as unknown as BillJson);
}

export interface BillPaymentInput {
  billerId: string;
  account: string;
  amountMinor: number;
  method: BillMethod;
  bank?: string;
}

/**
 * Pay a biller (`422 invalid_input`, detail biller | account | amount | method). A biller that
 * sends bills is paid this month's bill in full: `409 bill_paid` once it's paid, `409
 * amount_mismatch` when the amount isn't the bill's. `409 insufficient_balance` when the balance
 * pays and doesn't cover it.
 */
export async function payBill(db: Db, input: BillPaymentInput): Promise<BillPayment> {
  try {
    const row = unwrap(
      await db.rpc('pay_bill', {
        p_biller: input.billerId,
        p_account: input.account,
        p_amount: input.amountMinor,
        p_method: input.method,
        ...(input.bank ? { p_bank: input.bank } : {}),
      }),
    ) as unknown as PaymentRow;
    return toPayment(row);
  } catch (err) {
    if (err instanceof DataError && err.code === 'insufficient_balance') {
      throw new DataError('insufficient_balance', undefined, 'Your balance doesn’t cover this payment. Add to it, or pay by UPI or net banking.');
    }
    if (err instanceof DataError && err.code === 'amount_mismatch') {
      throw new DataError('amount_mismatch', undefined, 'The amount isn’t this month’s bill. Fetch the bill again and pay what it says.');
    }
    throw err;
  }
}

/** The caller's bill payments in a store, a category's only when given, newest first. */
export async function listBillPayments(db: Db, market: Market, opts: { category?: BillCategory; limit?: number } = {}): Promise<BillPayment[]> {
  let q = db.from('bill_payments').select(PAYMENT_COLUMNS).eq('market_id', market);
  if (opts.category) q = q.eq('category', opts.category);
  const rows = unwrap(await q.order('created_at', { ascending: false }).limit(opts.limit ?? 20)) as PaymentRow[];
  return rows.map(toPayment);
}

/** The accounts paid lately, each once (its latest payment), for "Pay again". */
export function recentBillAccounts(payments: BillPayment[], max = 3): BillPayment[] {
  const seen = new Set<string>();
  return payments.filter((p) => !seen.has(`${p.billerId}:${p.account}`) && seen.add(`${p.billerId}:${p.account}`)).slice(0, max);
}
