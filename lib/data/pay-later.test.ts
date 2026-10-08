import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { DataError } from './errors';
import { activatePayLater, isRepayMethod, listPayLaterRepayments, nextBillOn, payLater, payLaterActivity, payLaterOffer, repayPayLater } from './pay-later';
import type { Transaction } from './transactions';

/** A client whose reads and RPCs answer with `reply`, recording the RPC names and arguments. */
function fakeDb(reply: { data: unknown; error: unknown }) {
  const rpcs: string[] = [];
  const args: unknown[] = [];
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: async () => reply,
    maybeSingle: async () => reply,
  };
  const db = {
    from: () => chain,
    rpc: async (fn: string, a?: unknown) => (rpcs.push(fn), args.push(a), reply),
  };
  return { db: db as unknown as Db, rpcs, args };
}

const ROW = {
  market_id: 'IN',
  activated_at: '2026-09-01T10:00:00Z',
  limit_minor: 6_000_000,
  used_minor: 1_550_000,
  credit_minor: 0,
  available_minor: 4_450_000,
  bill_minor: 1_200_000,
  unbilled_minor: 350_000,
  due_on: '2026-10-05',
  overdue: false,
};
const ACCOUNT = {
  market: 'IN',
  activatedAt: '2026-09-01T10:00:00Z',
  limitMinor: 6_000_000,
  usedMinor: 1_550_000,
  creditMinor: 0,
  availableMinor: 4_450_000,
  billMinor: 1_200_000,
  unbilledMinor: 350_000,
  dueOn: '2026-10-05',
  overdue: false,
};

it('reads the account, or null before it is activated', async () => {
  const read = fakeDb({ data: ROW, error: null });
  expect(await payLater(read.db)).toEqual(ACCOUNT);
  expect(read.rpcs).toEqual(['pay_later']);
  // no bill: no due date
  expect(await payLater(fakeDb({ data: { ...ROW, bill_minor: 0, due_on: null }, error: null }).db)).toEqual({ ...ACCOUNT, billMinor: 0, dueOn: undefined });
  expect(await payLater(fakeDb({ data: null, error: null }).db)).toBeNull();
  await expect(payLater(fakeDb({ data: null, error: { code: '42501', message: 'not_authenticated' } }).db)).rejects.toBeInstanceOf(DataError);
});

it('activates in a store and repays through the RPCs', async () => {
  const act = fakeDb({ data: ROW, error: null });
  expect(await activatePayLater(act.db, 'IN')).toEqual(ACCOUNT);
  expect(act.rpcs).toEqual(['activate_pay_later']);
  expect(act.args).toEqual([{ p_market: 'IN' }]);

  const repay = fakeDb({ data: ROW, error: null });
  await repayPayLater(repay.db, 50_000, 'upi');
  await repayPayLater(repay.db, 50_000, 'netbanking', 'HDFC Bank');
  expect(repay.rpcs).toEqual(['repay_pay_later', 'repay_pay_later']);
  expect(repay.args).toEqual([
    { p_amount: 50_000, p_method: 'upi' },
    { p_amount: 50_000, p_method: 'netbanking', p_bank: 'HDFC Bank' },
  ]);

  const unavailable = fakeDb({ data: null, error: { code: '22023', message: 'pay_later_unavailable' } });
  await expect(activatePayLater(unavailable.db, 'US')).rejects.toMatchObject({ code: 'pay_later_unavailable', status: 422 });
  const tooMuch = fakeDb({ data: null, error: { code: '22023', message: 'invalid_input', details: 'amount' } });
  await expect(repayPayLater(tooMuch.db, 99_999_999, 'upi')).rejects.toMatchObject({ code: 'invalid_input', detail: 'amount' });
});

it('repays by UPI or net banking only', () => {
  expect(['upi', 'netbanking', 'card', 'cod', '', null].map(isRepayMethod)).toEqual([true, true, false, false, false, false]);
});

it('lists repayments and reads the store’s limit', async () => {
  const rows = [
    { id: 'r2', amount_minor: 100_000, method: 'netbanking', bank: 'HDFC Bank', created_at: '2026-10-02T10:00:00Z' },
    { id: 'r1', amount_minor: 50_000, method: 'upi', bank: null, created_at: '2026-10-01T10:00:00Z' },
  ];
  expect(await listPayLaterRepayments(fakeDb({ data: rows, error: null }).db)).toEqual([
    { id: 'r2', amountMinor: 100_000, method: 'netbanking', bank: 'HDFC Bank', at: '2026-10-02T10:00:00Z' },
    { id: 'r1', amountMinor: 50_000, method: 'upi', at: '2026-10-01T10:00:00Z' },
  ]);
  expect(await payLaterOffer(fakeDb({ data: { pay_later_limit_minor: 6_000_000 }, error: null }).db, 'IN')).toBe(6_000_000);
  expect(await payLaterOffer(fakeDb({ data: { pay_later_limit_minor: null }, error: null }).db, 'US')).toBeNull();
  expect(await payLaterOffer(fakeDb({ data: null, error: { message: 'boom' } }).db, 'IN')).toBeNull();
});

it('builds the activity from Pay Later charges and refunds that went through, and the repayments, newest first', () => {
  const t = (over: Partial<Transaction>): Transaction => ({
    key: 'order:a', kind: 'charge', source: 'order', amountMinor: 1000, at: '2026-10-03T00:00:00Z',
    status: 'completed', method: 'paylater', paymentLabel: 'Pay Later', orderId: 'a', ...over,
  });
  const activity = payLaterActivity(
    [
      t({}),
      t({ key: 'return:x', kind: 'refund', source: 'return', amountMinor: 400, at: '2026-10-05T00:00:00Z' }),
      t({ key: 'return:y', kind: 'refund', source: 'return', amountMinor: 300, status: 'pending', at: '2026-10-06T00:00:00Z' }),
      t({ key: 'order:b', method: 'upi', paymentLabel: 'UPI', orderId: 'b' }),
    ],
    [{ id: 'r1', amountMinor: 600, method: 'upi', at: '2026-10-04T00:00:00Z' }],
  );
  expect(activity).toEqual([
    { key: 'return:x', kind: 'refund', amountMinor: 400, at: '2026-10-05T00:00:00Z', orderId: 'a' },
    { key: 'repayment:r1', kind: 'repayment', amountMinor: 600, at: '2026-10-04T00:00:00Z', repayment: { method: 'upi' } },
    { key: 'order:a', kind: 'purchase', amountMinor: 1000, at: '2026-10-03T00:00:00Z', orderId: 'a' },
  ]);
});

it('makes the next bill on the 1st of next month, in the store’s time zone', () => {
  expect(nextBillOn(new Date('2026-10-08T10:00:00Z'), 'Asia/Kolkata')).toBe('2026-11-01');
  // 31 December 20:00 UTC is already 1 January in India
  expect(nextBillOn(new Date('2026-12-31T20:00:00Z'), 'Asia/Kolkata')).toBe('2027-02-01');
  expect(nextBillOn(new Date('2026-12-31T20:00:00Z'), 'America/New_York')).toBe('2027-01-01');
});
