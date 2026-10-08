import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { acceptPlusHousehold, declinePlusHousehold, endPlusHousehold, invitePlusHousehold, plusHousehold } from './plus-household';

/** A client whose RPCs answer with `reply`, recording the RPC names and arguments. */
function fakeDb(reply: { data: unknown; error: unknown }) {
  const calls: [string, unknown][] = [];
  const db = { rpc: async (fn: string, a?: unknown) => (calls.push([fn, a]), reply) };
  return { db: db as unknown as Db, calls };
}

const OWNER = '6f1c2b8e-4a1d-4c39-9d5b-2f6a8e1c7b30';

it('reads the household: the sharing of the caller’s Plus, the one they share, and their invites', async () => {
  const { db, calls } = fakeDb({
    data: {
      owned: { email: 'ravi@example.test', member_name: 'Ravi', invited_at: '2026-10-01T10:00:00Z', joined_at: '2026-10-02T10:00:00Z' },
      shared: { owner_name: 'Asha', joined_at: '2026-10-03T10:00:00Z', plan: 'monthly' },
      invites: [{ owner_id: OWNER, owner_name: null, invited_at: '2026-10-04T10:00:00Z' }],
    },
    error: null,
  });
  expect(await plusHousehold(db)).toEqual({
    owned: { email: 'ravi@example.test', memberName: 'Ravi', invitedAt: '2026-10-01T10:00:00Z', joinedAt: '2026-10-02T10:00:00Z' },
    shared: { ownerName: 'Asha', since: '2026-10-03T10:00:00Z' },
    invites: [{ ownerId: OWNER, invitedAt: '2026-10-04T10:00:00Z' }],
  });
  expect(calls).toEqual([['plus_household', undefined]]);
  // an invite still waiting has no member yet
  const waiting = fakeDb({ data: { owned: { email: 'ravi@example.test', member_name: null, invited_at: '2026-10-01T10:00:00Z', joined_at: null }, shared: null, invites: [] }, error: null });
  expect(await plusHousehold(waiting.db)).toEqual({ owned: { email: 'ravi@example.test', invitedAt: '2026-10-01T10:00:00Z' }, shared: null, invites: [] });
});

it('invites, accepts, declines and ends through the RPCs', async () => {
  const none = { data: { owned: null, shared: null, invites: [] }, error: null };
  const invite = fakeDb(none);
  expect(await invitePlusHousehold(invite.db, 'ravi@example.test')).toEqual({ owned: null, shared: null, invites: [] });
  const accept = fakeDb(none);
  await acceptPlusHousehold(accept.db, OWNER);
  const decline = fakeDb(none);
  await declinePlusHousehold(decline.db, OWNER);
  const end = fakeDb(none);
  await endPlusHousehold(end.db);
  expect([...invite.calls, ...accept.calls, ...decline.calls, ...end.calls]).toEqual([
    ['invite_plus_household', { p_email: 'ravi@example.test' }],
    ['accept_plus_household', { p_owner: OWNER }],
    ['decline_plus_household', { p_owner: OWNER }],
    ['end_plus_household', undefined],
  ]);
});

it('raises the database’s refusals', async () => {
  const refuse = (message: string, details = '') => fakeDb({ data: null, error: { code: 'P0001', message, details } }).db;
  await expect(invitePlusHousehold(refuse('plus_required'), 'x@example.test')).rejects.toMatchObject({ code: 'plus_required', status: 403 });
  await expect(invitePlusHousehold(refuse('invalid_input', 'email'), 'nope')).rejects.toMatchObject({ code: 'invalid_input', detail: 'email', status: 422 });
  await expect(invitePlusHousehold(refuse('household_full'), 'x@example.test')).rejects.toMatchObject({ code: 'household_full', status: 409 });
  await expect(acceptPlusHousehold(refuse('invite_not_found'), OWNER)).rejects.toMatchObject({ code: 'invite_not_found', status: 404 });
  await expect(acceptPlusHousehold(refuse('plus_owned'), OWNER)).rejects.toMatchObject({ code: 'plus_owned', status: 409 });
  await expect(acceptPlusHousehold(refuse('household_member'), OWNER)).rejects.toMatchObject({ code: 'household_member', status: 409 });
});
