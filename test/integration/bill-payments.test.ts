import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { balanceHistory, storeBalance } from '@/lib/data/balance';
import { fetchBill, listBillers, listBillPayments, payBill } from '@/lib/data/bills';
import { DataError } from '@/lib/data/errors';
import { listTransactions } from '@/lib/data/transactions';
import { admin, anon, deleteUser, newUser, type TestUser } from './helpers';

/** What a call failed with, as `code:detail` (or 'no error'). */
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
  return 'no error';
};

const setBalance = (u: TestUser, minor: number) =>
  admin().from('store_balances').update({ balance_minor: minor }).eq('user_id', u.id).eq('market_id', 'IN');

let shopper: TestUser;
let other: TestUser;
const ACCOUNT = '1234567890';

beforeAll(async () => {
  [shopper, other] = await Promise.all([newUser('Bill Shopper'), newUser('Bill Neighbour')]);
});

afterAll(async () => {
  await Promise.all([deleteUser(shopper), deleteUser(other)]);
});

describe('bill payments (amazon.in)', () => {
  it('has billers of each kind in India, and none in the US', async () => {
    const billers = await listBillers(shopper.db, 'IN');
    expect(new Set(billers.map((b) => b.category))).toEqual(new Set(['electricity', 'dth', 'broadband', 'gas', 'water', 'fastag']));
    const dth = await listBillers(shopper.db, 'IN', 'dth');
    expect(dth.length).toBeGreaterThan(0);
    expect(dth.every((b) => b.category === 'dth' && !b.fetches)).toBe(true);
    expect((await listBillers(anon(), 'IN', 'electricity')).find((b) => b.id === 'bescom')).toMatchObject({ fetches: true, accountLabel: 'Account ID' });
    expect(await listBillers(shopper.db, 'US')).toEqual([]);
  });

  it('fetches the same bill every time, for anyone, and refuses what isn’t a bill', async () => {
    const bill = await fetchBill(anon(), 'bescom', `${ACCOUNT.slice(0, 5)} ${ACCOUNT.slice(5)}`);
    expect(bill).toMatchObject({ billerId: 'bescom', account: ACCOUNT, period: expect.stringMatching(/^\d{4}-\d{2}-01$/), overdue: expect.any(Boolean) });
    expect(bill.dueOn).toBe(`${bill.period.slice(0, 8)}20`);
    expect(bill.amountMinor % 100).toBe(0);
    expect(bill.paid).toBeUndefined();
    expect(await fetchBill(shopper.db, 'bescom', ACCOUNT)).toEqual(bill);
    expect(await failure(fetchBill(shopper.db, 'tata-play', ACCOUNT))).toBe('invalid_input:biller');
    expect(await failure(fetchBill(shopper.db, 'bescom', '12345'))).toBe('invalid_input:account');
    expect(await failure(fetchBill(shopper.db, 'no-such-biller', ACCOUNT))).toBe('invalid_input:biller');
  });

  it('pays a bill in full from the balance, once', async () => {
    await setBalance(shopper, 10_000_000);
    const bill = await fetchBill(shopper.db, 'bescom', ACCOUNT);
    expect(await failure(payBill(shopper.db, { billerId: 'bescom', account: ACCOUNT, amountMinor: bill.amountMinor + 100, method: 'amazonpay' }))).toBe('amount_mismatch:');
    const paid = await payBill(shopper.db, { billerId: 'bescom', account: ACCOUNT, amountMinor: bill.amountMinor, method: 'amazonpay' });
    expect(paid).toMatchObject({ billerId: 'bescom', category: 'electricity', billerName: 'BESCOM (Bengaluru)', account: ACCOUNT, period: bill.period, amountMinor: bill.amountMinor, method: 'amazonpay' });
    expect(await storeBalance(shopper.db, 'IN')).toBe(10_000_000 - bill.amountMinor);
    expect((await balanceHistory(shopper.db, 'IN'))[0]).toMatchObject({ kind: 'bill', amountMinor: -bill.amountMinor });

    // paid: the shopper sees it, and can't pay it again; a neighbour with the same account hasn't paid
    expect((await fetchBill(shopper.db, 'bescom', ACCOUNT)).paid).toEqual({ id: paid.id, amountMinor: bill.amountMinor, at: paid.at });
    expect(await failure(payBill(shopper.db, { billerId: 'bescom', account: ACCOUNT, amountMinor: bill.amountMinor, method: 'upi' }))).toBe('bill_paid:');
    expect((await fetchBill(other.db, 'bescom', ACCOUNT)).paid).toBeUndefined();
  });

  it('refuses billers, accounts, amounts and methods that aren’t right', async () => {
    const pay = (over: Partial<Parameters<typeof payBill>[1]>) =>
      failure(payBill(shopper.db, { billerId: 'tata-play', account: ACCOUNT, amountMinor: 50_000, method: 'upi', ...over }));
    expect(await pay({ billerId: 'no-such-biller' })).toBe('invalid_input:biller');
    expect(await pay({ account: '12345' })).toBe('invalid_input:account');
    expect(await pay({ amountMinor: 50_050 })).toBe('invalid_input:amount');
    expect(await pay({ amountMinor: 5_000 })).toBe('invalid_input:amount');
    expect(await pay({ amountMinor: 3_000_000 })).toBe('invalid_input:amount');
    expect(await pay({ method: 'card' as 'upi' })).toBe('invalid_input:method');
  });

  it('tops up a FASTag by net banking with the vehicle number tidied, and refuses a balance that doesn’t cover it', async () => {
    const tag = await payBill(shopper.db, { billerId: 'hdfc-fastag', account: 'mh 12-ab 1234', amountMinor: 50_000, method: 'netbanking', bank: '  HDFC Bank ' });
    expect(tag).toMatchObject({ category: 'fastag', account: 'MH12AB1234', amountMinor: 50_000, method: 'netbanking', bank: 'HDFC Bank' });
    expect(tag.period).toBeUndefined();
    expect(await failure(payBill(shopper.db, { billerId: 'hdfc-fastag', account: 'MH12', amountMinor: 50_000, method: 'upi' }))).toBe('invalid_input:account');

    await setBalance(shopper, 10_000);
    expect(await failure(payBill(shopper.db, { billerId: 'tata-play', account: ACCOUNT, amountMinor: 50_000, method: 'amazonpay' }))).toBe('insufficient_balance:');
    expect(await storeBalance(shopper.db, 'IN')).toBe(10_000);
  });

  it('lists the payments, and shows them as transactions', async () => {
    const payments = await listBillPayments(shopper.db, 'IN');
    expect(payments.map((p) => p.billerId)).toEqual(['hdfc-fastag', 'bescom']);
    expect((await listBillPayments(shopper.db, 'IN', { category: 'fastag' })).map((p) => p.billerId)).toEqual(['hdfc-fastag']);
    expect(await listBillPayments(other.db, 'IN')).toEqual([]);
    const bills = (await listTransactions(shopper.db, 'IN', shopper.id)).filter((t) => t.source === 'bill');
    expect(bills.map((t) => [t.kind, t.method, t.paymentLabel, t.biller])).toEqual([
      ['charge', 'netbanking', 'Net banking · HDFC Bank', { name: 'HDFC Bank FASTag', account: 'MH12AB1234' }],
      ['charge', 'amazonpay', '', { name: 'BESCOM (Bengaluru)', account: ACCOUNT }],
    ]);
  });

  it('is written only through pay_bill, and only signed in', async () => {
    const forged = await shopper.db.from('bill_payments').insert({
      user_id: shopper.id, market_id: 'IN', biller_id: 'tata-play', category: 'dth', biller_name: 'Tata Play', account: ACCOUNT, amount_minor: 100, method: 'upi',
    });
    expect(forged.error).not.toBeNull();
    const cheaper = await shopper.db.from('bill_payments').update({ amount_minor: 100 }).eq('user_id', shopper.id).select();
    expect(cheaper.error ?? (cheaper.data?.length === 0 ? 'no rows' : null)).toBeTruthy();
    const biller = await shopper.db.from('billers').update({ max_minor: 1 }).eq('id', 'tata-play').select();
    expect(biller.error ?? (biller.data?.length === 0 ? 'no rows' : null)).toBeTruthy();
    expect(await failure(payBill(anon(), { billerId: 'tata-play', account: ACCOUNT, amountMinor: 50_000, method: 'upi' }))).not.toBe('no error');
  });
});
