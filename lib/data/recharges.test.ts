import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { DataError } from './errors';
import { listRechargePlans, listRecharges, rechargeMobile, recentNumbers, type Recharge } from './recharges';

/** A client whose reads and RPCs answer with `reply`, recording the filters, RPC names and arguments. */
function fakeDb(reply: { data: unknown; error: unknown }) {
  const calls: string[] = [];
  const args: unknown[] = [];
  const chain = {
    select: () => chain,
    eq: (col: string, v: unknown) => (calls.push(`${col}=${String(v)}`), chain),
    order: () => chain,
    limit: async () => reply,
    then: (resolve: (v: unknown) => void) => resolve(reply),
  };
  const db = {
    from: (t: string) => (calls.push(t), chain),
    rpc: async (fn: string, a?: unknown) => (calls.push(fn), args.push(a), reply),
  };
  return { db: db as unknown as Db, calls, args };
}

const ROW = {
  id: 'r1', number: '9876543210', operator: 'Jio', circle: 'Mumbai', plan_id: 'jio-299', amount_minor: 29_900,
  cashback_minor: 500, method: 'netbanking', bank: 'HDFC Bank', created_at: '2026-10-08T10:00:00Z',
};
const RECHARGE: Recharge = {
  id: 'r1', number: '9876543210', operator: 'Jio', circle: 'Mumbai', planId: 'jio-299', amountMinor: 29_900,
  cashbackMinor: 500, method: 'netbanking', bank: 'HDFC Bank', at: '2026-10-08T10:00:00Z',
};

it('lists a store’s plans, an operator’s when given', async () => {
  const read = fakeDb({
    data: [
      { id: 'jio-299', operator: 'Jio', amount_minor: 29_900, validity_days: 28, data: '1.5 GB/day', calls: 'Unlimited', sms: '100/day', kind: 'unlimited' },
      { id: 'jio-19', operator: 'Jio', amount_minor: 1_900, validity_days: null, data: '1 GB', calls: null, sms: null, kind: 'data' },
    ],
    error: null,
  });
  expect(await listRechargePlans(read.db, 'IN', 'Jio')).toEqual([
    { id: 'jio-299', operator: 'Jio', amountMinor: 29_900, validityDays: 28, data: '1.5 GB/day', calls: 'Unlimited', sms: '100/day', kind: 'unlimited' },
    { id: 'jio-19', operator: 'Jio', amountMinor: 1_900, data: '1 GB', kind: 'data' },
  ]);
  expect(read.calls).toEqual(['recharge_plans', 'market_id=IN', 'active=true', 'operator=Jio']);
});

it('recharges through the RPC, naming the bank for net banking', async () => {
  const pay = fakeDb({ data: ROW, error: null });
  expect(await rechargeMobile(pay.db, { number: '9876543210', circle: 'Mumbai', planId: 'jio-299', method: 'netbanking', bank: 'HDFC Bank' })).toEqual(RECHARGE);
  await rechargeMobile(pay.db, { number: '9876543210', circle: 'Mumbai', planId: 'jio-299', method: 'upi' });
  expect(pay.calls).toEqual(['recharge_mobile', 'recharge_mobile']);
  expect(pay.args).toEqual([
    { p_number: '9876543210', p_circle: 'Mumbai', p_plan: 'jio-299', p_method: 'netbanking', p_bank: 'HDFC Bank' },
    { p_number: '9876543210', p_circle: 'Mumbai', p_plan: 'jio-299', p_method: 'upi' },
  ]);
});

it('says when the balance doesn’t cover the recharge, and passes other refusals on', async () => {
  const short = fakeDb({ data: null, error: { code: 'P0001', message: 'insufficient_balance' } });
  const err = await rechargeMobile(short.db, { number: '9876543210', circle: 'Mumbai', planId: 'jio-299', method: 'amazonpay' }).catch((e) => e);
  expect(err).toBeInstanceOf(DataError);
  expect(err).toMatchObject({ code: 'insufficient_balance', status: 409 });
  expect(err.message).toMatch(/doesn’t cover this recharge/);
  const bad = fakeDb({ data: null, error: { code: '22023', message: 'invalid_input', details: 'circle' } });
  await expect(rechargeMobile(bad.db, { number: '9876543210', circle: 'Atlantis', planId: 'jio-299', method: 'upi' })).rejects.toMatchObject({ code: 'invalid_input', detail: 'circle' });
});

it('lists the caller’s recharges in a store', async () => {
  const read = fakeDb({ data: [{ ...ROW, method: 'upi', bank: null }], error: null });
  const list = await listRecharges(read.db, 'IN');
  expect(list).toEqual([{ ...RECHARGE, method: 'upi', bank: undefined }]);
  expect(list[0]).not.toHaveProperty('bank');
  expect(read.calls).toEqual(['recharges', 'market_id=IN']);
});

it('keeps each number’s latest recharge for "Recharge again"', () => {
  const r = (id: string, number: string): Recharge => ({ ...RECHARGE, id, number });
  expect(recentNumbers([r('a', '9000000001'), r('b', '9000000002'), r('c', '9000000001'), r('d', '9000000003'), r('e', '9000000004')]).map((x) => x.id)).toEqual(['a', 'b', 'd']);
});
