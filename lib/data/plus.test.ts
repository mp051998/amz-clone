import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { DataError } from './errors';
import { joinPlus, leavePlus, plusMembership, setDeliveryDay, setPlusPlan, setPlusRenewal } from './plus';

/** A client whose plus_members read and RPCs answer with `reply`, recording the RPC names and arguments. */
function fakeDb(reply: { data: unknown; error: unknown }) {
  const rpcs: string[] = [];
  const args: unknown[] = [];
  const db = {
    from: () => ({ select: () => ({ maybeSingle: async () => reply }) }),
    rpc: async (fn: string, a?: unknown) => (rpcs.push(fn), args.push(a), reply),
  };
  return { db: db as unknown as Db, rpcs, args };
}

const ROW = {
  joined_at: '2026-10-06T10:00:00Z',
  delivery_day: null,
  market_id: 'IN',
  plan: 'quarterly',
  next_plan: null,
  renews_at: '2027-01-06T10:00:00Z',
  auto_renew: true,
};
const MEMBER = { since: '2026-10-06T10:00:00Z', market: 'IN', plan: 'quarterly', renewsAt: '2027-01-06T10:00:00Z', autoRenew: true };

it('reads the membership, or null when there is none or it cannot be read', async () => {
  expect(await plusMembership(fakeDb({ data: ROW, error: null }).db)).toEqual(MEMBER);
  expect(await plusMembership(fakeDb({ data: { ...ROW, delivery_day: 5, next_plan: 'annual', auto_renew: false }, error: null }).db)).toEqual({
    ...MEMBER,
    deliveryDay: 5,
    nextPlan: 'annual',
    autoRenew: false,
  });
  // before the plans migration: monthly in the US store, renewing
  expect(await plusMembership(fakeDb({ data: { joined_at: '2026-10-06T10:00:00Z' }, error: null }).db)).toEqual({
    since: '2026-10-06T10:00:00Z',
    market: 'US',
    plan: 'monthly',
    autoRenew: true,
  });
  expect(await plusMembership(fakeDb({ data: null, error: null }).db)).toBeNull();
  // signed out (anon can't read the table), or before the migration
  expect(await plusMembership(fakeDb({ data: null, error: { code: '42501', message: 'permission denied' } }).db)).toBeNull();
});

it('falls back to the membership a household member shares with the caller', async () => {
  const shared = (household: { data: unknown; error: unknown }) => {
    const rpcs: string[] = [];
    const db = {
      from: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      rpc: async (fn: string) => (rpcs.push(fn), household),
    };
    return { db: db as unknown as Db, rpcs };
  };
  const SHARED = { ...ROW, joined_at: '2026-10-07T09:00:00Z', delivery_day: 3, owner_name: 'Asha' };
  const asha = shared({ data: { owned: null, shared: SHARED, invites: [] }, error: null });
  // the plan and renewal are Asha's; the Delivery Day isn't shared
  expect(await plusMembership(asha.db)).toEqual({ ...MEMBER, since: '2026-10-07T09:00:00Z', shared: { ownerName: 'Asha' } });
  expect(asha.rpcs).toEqual(['plus_household']);
  expect(await plusMembership(shared({ data: { owned: null, shared: { ...SHARED, owner_name: null }, invites: [] }, error: null }).db)).toMatchObject({ shared: {} });
  expect(await plusMembership(shared({ data: { owned: null, shared: null, invites: [] }, error: null }).db)).toBeNull();
  // before the household migration
  expect(await plusMembership(shared({ data: null, error: { code: 'PGRST202', message: 'not found' } }).db)).toBeNull();
  // the caller's own membership needs no second read
  const own = fakeDb({ data: ROW, error: null });
  await plusMembership(own.db);
  expect(own.rpcs).toEqual([]);
});

it('joins on a plan and leaves through the RPCs', async () => {
  const join = fakeDb({ data: ROW, error: null });
  expect(await joinPlus(join.db, 'IN', 'quarterly')).toEqual(MEMBER);
  expect(join.rpcs).toEqual(['join_plus']);
  expect(join.args).toEqual([{ p_market: 'IN', p_plan: 'quarterly' }]);
  // monthly in the US store unless told otherwise
  const plain = fakeDb({ data: ROW, error: null });
  await joinPlus(plain.db);
  expect(plain.args).toEqual([{ p_market: 'US', p_plan: 'monthly' }]);

  const leave = fakeDb({ data: null, error: null });
  await leavePlus(leave.db);
  expect(leave.rpcs).toEqual(['leave_plus']);
});

it('a signed-out join is refused', async () => {
  const { db } = fakeDb({ data: null, error: { code: '42501', message: 'not_authenticated' } });
  await expect(joinPlus(db)).rejects.toBeInstanceOf(DataError);
});

it('sets or clears the Delivery Day through the RPC', async () => {
  const set = fakeDb({ data: { delivery_day: 5 }, error: null });
  expect(await setDeliveryDay(set.db, 5)).toBe(5);
  expect(set.rpcs).toEqual(['set_delivery_day']);
  expect(await setDeliveryDay(fakeDb({ data: { delivery_day: null }, error: null }).db, null)).toBeNull();
  // not a member
  const refused = fakeDb({ data: null, error: { code: 'P0001', message: 'plus_required' } });
  await expect(setDeliveryDay(refused.db, 5)).rejects.toMatchObject({ code: 'plus_required', status: 403 });
});

it('switches plans and turns renewal on or off through the RPCs', async () => {
  const sw = fakeDb({ data: { ...ROW, next_plan: 'annual' }, error: null });
  expect(await setPlusPlan(sw.db, 'annual')).toEqual({ ...MEMBER, nextPlan: 'annual' });
  expect(sw.rpcs).toEqual(['set_plus_plan']);
  expect(sw.args).toEqual([{ p_plan: 'annual' }]);

  const off = fakeDb({ data: { ...ROW, auto_renew: false }, error: null });
  expect(await setPlusRenewal(off.db, false)).toEqual({ ...MEMBER, autoRenew: false });
  expect(off.rpcs).toEqual(['set_plus_renewal']);
  expect(off.args).toEqual([{ p_renew: false }]);

  const refused = fakeDb({ data: null, error: { code: 'P0001', message: 'plus_required' } });
  await expect(setPlusRenewal(refused.db, true)).rejects.toMatchObject({ code: 'plus_required', status: 403 });
  const unsold = fakeDb({ data: null, error: { code: '22023', message: 'invalid_input', details: 'plan' } });
  await expect(setPlusPlan(unsold.db, 'quarterly')).rejects.toMatchObject({ code: 'invalid_input', status: 422 });
});
