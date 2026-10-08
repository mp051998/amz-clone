import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { balanceHistory, storeBalance } from '@/lib/data/balance';
import { DataError } from '@/lib/data/errors';
import { listRechargePlans, listRecharges, rechargeMobile } from '@/lib/data/recharges';
import { listTransactions } from '@/lib/data/transactions';
import type { RechargeMethod } from '@/lib/recharge';
import { admin, deleteUser, newUser, type TestUser } from './helpers';

/** What a call failed with, as `code:detail` (or 'no error'). */
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
  return 'no error';
};

let shopper: TestUser;
const NUMBER = '9876543210';

beforeAll(async () => {
  shopper = await newUser('Recharge Shopper');
});

afterAll(async () => {
  await deleteUser(shopper);
});

describe('mobile recharge (amazon.in)', () => {
  it('has each operator’s plans in India, and none in the US', async () => {
    const plans = await listRechargePlans(shopper.db, 'IN');
    expect(new Set(plans.map((p) => p.operator))).toEqual(new Set(['Jio', 'Airtel', 'Vi', 'BSNL']));
    // plans before data packs, cheapest first
    const jio = await listRechargePlans(shopper.db, 'IN', 'Jio');
    expect(jio.every((p) => p.operator === 'Jio')).toBe(true);
    const kinds = jio.map((p) => p.kind);
    expect(kinds).toEqual([...kinds].sort((a, b) => (a === b ? 0 : a === 'unlimited' ? -1 : 1)));
    const unlimited = jio.filter((p) => p.kind === 'unlimited').map((p) => p.amountMinor);
    expect(unlimited).toEqual([...unlimited].sort((a, b) => a - b));
    expect(jio.find((p) => p.id === 'jio-299')).toEqual({
      id: 'jio-299', operator: 'Jio', amountMinor: 29_900, validityDays: 28, data: '1.5 GB/day', calls: 'Unlimited', sms: '100/day', kind: 'unlimited',
    });
    expect(await listRechargePlans(shopper.db, 'US')).toEqual([]);
  });

  it('refuses a bad number, circle, plan or method', async () => {
    const go = (over: Partial<Parameters<typeof rechargeMobile>[1]>) =>
      failure(rechargeMobile(shopper.db, { number: NUMBER, circle: 'Mumbai', planId: 'jio-299', method: 'upi', ...over }));
    expect(await go({ number: '5876543210' })).toBe('invalid_input:number');
    expect(await go({ number: '98765' })).toBe('invalid_input:number');
    expect(await go({ circle: 'Atlantis' })).toBe('invalid_input:circle');
    expect(await go({ planId: 'nope' })).toBe('invalid_input:plan');
    expect(await go({ method: 'card' as RechargeMethod })).toBe('invalid_input:method');
    expect(await listRecharges(shopper.db, 'IN')).toEqual([]);
  });

  it('recharges from the balance, refusing what it doesn’t cover, and pays the cashback into it, up to ₹25', async () => {
    // ₹5,000 on the balance
    const start = 500_000;
    await admin().from('store_balances').update({ balance_minor: start }).eq('user_id', shopper.id).eq('market_id', 'IN');
    expect(await storeBalance(shopper.db, 'IN')).toBe(start);

    const done = await rechargeMobile(shopper.db, { number: NUMBER, circle: 'Mumbai', planId: 'jio-299', method: 'amazonpay' });
    expect(done).toMatchObject({ number: NUMBER, operator: 'Jio', circle: 'Mumbai', planId: 'jio-299', amountMinor: 29_900, cashbackMinor: 500, method: 'amazonpay' });
    expect(await storeBalance(shopper.db, 'IN')).toBe(start - 29_900 + 500);
    expect((await balanceHistory(shopper.db, 'IN', 2)).map((e) => [e.kind, e.amountMinor])).toEqual([
      ['cashback', 500],
      ['recharge', -29_900],
    ]);
    const year = await rechargeMobile(shopper.db, { number: NUMBER, circle: 'Mumbai', planId: 'jio-3599', method: 'amazonpay' });
    expect(year).toMatchObject({ amountMinor: 359_900, cashbackMinor: 2_500 });

    // ₹3,499 is more than what's left
    const before = (await storeBalance(shopper.db, 'IN'))!;
    expect(before).toBe(start - 29_900 + 500 - 359_900 + 2_500);
    expect(await failure(rechargeMobile(shopper.db, { number: NUMBER, circle: 'Mumbai', planId: 'vi-3499', method: 'amazonpay' }))).toBe('insufficient_balance:');
    expect(await storeBalance(shopper.db, 'IN')).toBe(before);
    expect(await listRecharges(shopper.db, 'IN')).toHaveLength(2);
  });

  it('recharges by UPI and net banking', async () => {
    const before = (await storeBalance(shopper.db, 'IN'))!;
    const upi = await rechargeMobile(shopper.db, { number: '9123456789', circle: 'Delhi NCR', planId: 'airtel-859', method: 'upi' });
    expect(upi).toMatchObject({ operator: 'Airtel', amountMinor: 85_900, cashbackMinor: 1_700, method: 'upi' });
    expect(upi.bank).toBeUndefined();
    const net = await rechargeMobile(shopper.db, { number: NUMBER, circle: 'Mumbai', planId: 'jio-19', method: 'netbanking', bank: 'HDFC Bank' });
    expect(net).toMatchObject({ amountMinor: 1_900, cashbackMinor: 0, method: 'netbanking', bank: 'HDFC Bank' });
    // neither took from the balance; only the cashback went in
    expect(await storeBalance(shopper.db, 'IN')).toBe(before + 1_700);

    const all = await listRecharges(shopper.db, 'IN');
    expect(all.slice(0, 2).map((r) => r.id)).toEqual([net.id, upi.id]);
    const tx = (await listTransactions(shopper.db, 'IN', shopper.id)).filter((t) => t.source === 'recharge');
    expect(tx.map((t) => [t.key, t.method, t.number])).toEqual(all.map((r) => [`recharge:${r.id}`, r.method, r.number]));
    expect(tx.map((t) => t.method)).toEqual(['netbanking', 'upi', 'amazonpay', 'amazonpay']);
  });

  it('is written only through recharge_mobile()', async () => {
    const forged = await shopper.db.from('recharges').insert({
      user_id: shopper.id, market_id: 'IN', number: NUMBER, operator: 'Jio', circle: 'Mumbai', plan_id: 'jio-19', amount_minor: 1, method: 'upi',
    });
    expect(forged.error).not.toBeNull();
    expect((await shopper.db.from('recharge_plans').update({ amount_minor: 1 }).eq('id', 'jio-299').select()).data ?? []).toEqual([]);
    const { data } = await admin().from('recharge_plans').select('amount_minor').eq('id', 'jio-299').single();
    expect(data?.amount_minor).toBe(29_900);
  });
});
