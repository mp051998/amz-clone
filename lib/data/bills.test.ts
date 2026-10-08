import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { DataError } from './errors';
import { fetchBill, listBillers, listBillPayments, payBill, recentBillAccounts, type BillPayment } from './bills';

/** A client whose reads and RPCs answer with `reply`, recording the filters, RPC names and arguments. */
function fakeDb(reply: { data: unknown; error: unknown }) {
  const calls: string[] = [];
  const args: unknown[] = [];
  const chain = {
    select: () => chain,
    eq: (col: string, v: unknown) => (calls.push(`${col}=${String(v)}`), chain),
    order: () => chain,
    limit: (n: number) => (calls.push(`limit=${n}`), chain),
    then: (resolve: (v: unknown) => void) => resolve(reply),
  };
  const db = {
    from: (t: string) => (calls.push(t), chain),
    rpc: async (fn: string, a?: unknown) => (calls.push(fn), args.push(a), reply),
  };
  return { db: db as unknown as Db, calls, args };
}

const ROW = {
  id: 'p1', biller_id: 'bescom', category: 'electricity', biller_name: 'BESCOM (Bengaluru)', account: '1234567890',
  period: '2026-10-01', amount_minor: 315_500, method: 'netbanking', bank: 'HDFC Bank', created_at: '2026-10-08T10:00:00Z',
};
const PAYMENT: BillPayment = {
  id: 'p1', billerId: 'bescom', category: 'electricity', billerName: 'BESCOM (Bengaluru)', account: '1234567890',
  period: '2026-10-01', amountMinor: 315_500, method: 'netbanking', bank: 'HDFC Bank', at: '2026-10-08T10:00:00Z',
};

it('lists a store’s billers, a category’s when given', async () => {
  const read = fakeDb({
    data: [{
      id: 'tata-play', category: 'dth', name: 'Tata Play', account_label: 'Subscriber ID', account_hint: '10 digits',
      account_pattern: '^[0-9]{10}$', fetches: false, min_minor: 10_000, max_minor: 2_500_000,
    }],
    error: null,
  });
  expect(await listBillers(read.db, 'IN', 'dth')).toEqual([{
    id: 'tata-play', category: 'dth', name: 'Tata Play', accountLabel: 'Subscriber ID', accountHint: '10 digits',
    accountPattern: '^[0-9]{10}$', fetches: false, minMinor: 10_000, maxMinor: 2_500_000,
  }]);
  expect(read.calls).toEqual(['billers', 'market_id=IN', 'active=true', 'category=dth']);
});

it('fetches a bill, with the caller’s payment when there is one', async () => {
  const json = { biller_id: 'bescom', account: '1234567890', period: '2026-10-01', amount_minor: 315_500, due_on: '2026-10-20', overdue: false, paid: null };
  const open = fakeDb({ data: json, error: null });
  expect(await fetchBill(open.db, 'bescom', '12345 67890')).toEqual({
    billerId: 'bescom', account: '1234567890', period: '2026-10-01', amountMinor: 315_500, dueOn: '2026-10-20', overdue: false,
  });
  expect(open.args).toEqual([{ p_biller: 'bescom', p_account: '12345 67890' }]);
  const paid = fakeDb({ data: { ...json, paid: { id: 'p1', amount_minor: 315_500, created_at: '2026-10-05T10:00:00Z' } }, error: null });
  expect((await fetchBill(paid.db, 'bescom', '1234567890')).paid).toEqual({ id: 'p1', amountMinor: 315_500, at: '2026-10-05T10:00:00Z' });
});

it('pays through the RPC, naming the bank for net banking', async () => {
  const pay = fakeDb({ data: ROW, error: null });
  expect(await payBill(pay.db, { billerId: 'bescom', account: '1234567890', amountMinor: 315_500, method: 'netbanking', bank: 'HDFC Bank' })).toEqual(PAYMENT);
  await payBill(pay.db, { billerId: 'tata-play', account: '1234567890', amountMinor: 50_000, method: 'amazonpay' });
  expect(pay.calls).toEqual(['pay_bill', 'pay_bill']);
  expect(pay.args).toEqual([
    { p_biller: 'bescom', p_account: '1234567890', p_amount: 315_500, p_method: 'netbanking', p_bank: 'HDFC Bank' },
    { p_biller: 'tata-play', p_account: '1234567890', p_amount: 50_000, p_method: 'amazonpay' },
  ]);
  // a biller without bills has no period
  const dth = fakeDb({ data: { ...ROW, period: null, bank: null, method: 'amazonpay' }, error: null });
  const done = await payBill(dth.db, { billerId: 'tata-play', account: '1234567890', amountMinor: 315_500, method: 'amazonpay' });
  expect(done.period).toBeUndefined();
  expect(done.bank).toBeUndefined();
});

it('says what a refusal means for a bill, and passes others on', async () => {
  const fail = async (error: unknown) => {
    try {
      await payBill(fakeDb({ data: null, error }).db, { billerId: 'bescom', account: '1234567890', amountMinor: 1, method: 'amazonpay' });
    } catch (err) {
      return err as DataError;
    }
    throw new Error('paid');
  };
  const short = await fail({ code: 'P0001', message: 'insufficient_balance' });
  expect([short.code, short.message]).toEqual(['insufficient_balance', 'Your balance doesn’t cover this payment. Add to it, or pay by UPI or net banking.']);
  const changed = await fail({ code: 'P0001', message: 'amount_mismatch' });
  expect([changed.code, changed.message]).toEqual(['amount_mismatch', 'The amount isn’t this month’s bill. Fetch the bill again and pay what it says.']);
  const paid = await fail({ code: 'P0001', message: 'bill_paid' });
  expect([paid.code, paid.message]).toEqual(['bill_paid', 'This month’s bill is already paid.']);
  const account = await fail({ code: '22023', message: 'invalid_input', details: 'account' });
  expect([account.code, account.detail]).toEqual(['invalid_input', 'account']);
});

it('lists the caller’s payments, a category’s when given', async () => {
  const read = fakeDb({ data: [ROW], error: null });
  expect(await listBillPayments(read.db, 'IN', { category: 'electricity', limit: 5 })).toEqual([PAYMENT]);
  expect(read.calls).toEqual(['bill_payments', 'market_id=IN', 'category=electricity', 'limit=5']);
  const all = fakeDb({ data: [], error: null });
  await listBillPayments(all.db, 'IN');
  expect(all.calls).toEqual(['bill_payments', 'market_id=IN', 'limit=20']);
});

it('picks each account paid lately once, its latest payment', () => {
  const p = (id: string, billerId: string, account: string) => ({ ...PAYMENT, id, billerId, account });
  expect(recentBillAccounts([p('a', 'bescom', '1'), p('b', 'bescom', '1'), p('c', 'msedcl', '1'), p('d', 'bescom', '2'), p('e', 'cesc', '3')]).map((x) => x.id))
    .toEqual(['a', 'c', 'd']);
});
