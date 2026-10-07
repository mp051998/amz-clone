import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { DataError } from './errors';
import { joinPlus, leavePlus, plusMembership, setDeliveryDay } from './plus';

/** A client whose plus_members read and RPCs answer with `reply`, recording the RPC names. */
function fakeDb(reply: { data: unknown; error: unknown }) {
  const rpcs: string[] = [];
  const db = {
    from: () => ({ select: () => ({ maybeSingle: async () => reply }) }),
    rpc: async (fn: string) => (rpcs.push(fn), reply),
  };
  return { db: db as unknown as Db, rpcs };
}

it('reads the membership, or null when there is none or it cannot be read', async () => {
  expect(await plusMembership(fakeDb({ data: { joined_at: '2026-10-06T10:00:00Z' }, error: null }).db)).toEqual({ since: '2026-10-06T10:00:00Z' });
  expect(await plusMembership(fakeDb({ data: { joined_at: '2026-10-06T10:00:00Z', delivery_day: 5 }, error: null }).db)).toEqual({ since: '2026-10-06T10:00:00Z', deliveryDay: 5 });
  expect(await plusMembership(fakeDb({ data: null, error: null }).db)).toBeNull();
  // signed out (anon can't read the table), or before the migration
  expect(await plusMembership(fakeDb({ data: null, error: { code: '42501', message: 'permission denied' } }).db)).toBeNull();
});

it('joins and leaves through the RPCs', async () => {
  const join = fakeDb({ data: { joined_at: '2026-10-06T10:00:00Z' }, error: null });
  expect(await joinPlus(join.db)).toEqual({ since: '2026-10-06T10:00:00Z' });
  expect(join.rpcs).toEqual(['join_plus']);

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
