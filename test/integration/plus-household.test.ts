import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataError } from '@/lib/data/errors';
import { joinPlus, leavePlus, plusMembership, setDeliveryDay, setPlusPlan } from '@/lib/data/plus';
import { acceptPlusHousehold, declinePlusHousehold, endPlusHousehold, invitePlusHousehold, plusHousehold } from '@/lib/data/plus-household';
import { anon, deleteUser, newUser, type TestUser } from './helpers';

/** What a call failed with, as `code:detail` (or 'no error'). */
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
  return 'no error';
};

/** The delivery charge on a $30 US order: $5.99, or nothing for a Plus member. */
const ship = async (u: TestUser) => (await u.db.rpc('order_totals', { p_market: 'US', p_subtotal: 3000 })).data![0].ship_minor;

const NONE = { owned: null, shared: null, invites: [] };

describe('Plus Household', () => {
  let owner: TestUser;
  let adult: TestUser;
  let stranger: TestUser;

  beforeAll(async () => {
    [owner, adult, stranger] = await Promise.all([newUser('Household Owner'), newUser('Household Adult'), newUser('Household Stranger')]);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(owner), deleteUser(adult), deleteUser(stranger)]);
  });

  it('only a member with their own Plus invites, and not their own email', async () => {
    expect(await failure(invitePlusHousehold(owner.db, adult.email))).toBe('plus_required:');
    await joinPlus(owner.db, 'US', 'annual');
    expect(await failure(invitePlusHousehold(owner.db, 'not-an-email'))).toBe('invalid_input:email');
    expect(await failure(invitePlusHousehold(owner.db, owner.email.toUpperCase()))).toBe('invalid_input:email');
    expect((await invitePlusHousehold(owner.db, stranger.email)).owned).toMatchObject({ email: stranger.email });
    // inviting someone else replaces the invite
    const household = await invitePlusHousehold(owner.db, ` ${adult.email.toUpperCase()} `);
    expect(household).toEqual({ ...NONE, owned: { email: adult.email, invitedAt: expect.any(String) } });
    expect(await plusHousehold(stranger.db)).toEqual(NONE);
  });

  it('only that email sees and accepts the invite, sharing FREE delivery from then on', async () => {
    expect((await plusHousehold(adult.db)).invites).toEqual([{ ownerId: owner.id, ownerName: 'Household Owner', invitedAt: expect.any(String) }]);
    expect(await failure(acceptPlusHousehold(stranger.db, owner.id))).toBe('invite_not_found:');
    expect(await ship(adult)).toBe(599);

    const household = await acceptPlusHousehold(adult.db, owner.id);
    expect(household).toEqual({ ...NONE, shared: { ownerName: 'Household Owner', since: expect.any(String) } });
    expect(await ship(adult)).toBe(0);
    const plus = await plusMembership(adult.db);
    expect(plus).toMatchObject({ market: 'US', plan: 'annual', autoRenew: true, shared: { ownerName: 'Household Owner' } });
    expect(plus!.deliveryDay).toBeUndefined();

    // the owner sees who joined, and can't invite anyone else
    expect((await plusHousehold(owner.db)).owned).toEqual({ email: adult.email, memberName: 'Household Adult', invitedAt: expect.any(String), joinedAt: expect.any(String) });
    expect(await failure(invitePlusHousehold(owner.db, stranger.email))).toBe('household_full:');
    expect(await failure(acceptPlusHousehold(adult.db, owner.id))).toBe('invite_not_found:');
  });

  it('the adult can’t manage the membership, pick a Delivery Day or share it on', async () => {
    expect(await failure(setPlusPlan(adult.db, 'monthly'))).toBe('plus_required:');
    expect(await failure(setDeliveryDay(adult.db, 3))).toBe('plus_required:');
    expect(await failure(invitePlusHousehold(adult.db, stranger.email))).toBe('plus_required:');
  });

  it('either of them ends the sharing, and an invite can be declined', async () => {
    expect(await endPlusHousehold(adult.db)).toEqual(NONE);
    expect(await plusMembership(adult.db)).toBeNull();
    expect(await ship(adult)).toBe(599);
    expect((await plusHousehold(owner.db)).owned).toBeNull();

    await invitePlusHousehold(owner.db, adult.email);
    expect(await declinePlusHousehold(adult.db, owner.id)).toEqual(NONE);
    expect((await plusHousehold(owner.db)).owned).toBeNull();

    await invitePlusHousehold(owner.db, adult.email);
    await acceptPlusHousehold(adult.db, owner.id);
    expect((await endPlusHousehold(owner.db)).owned).toBeNull();
    expect(await ship(adult)).toBe(599);
  });

  it('ends on joining Plus and with the membership; one household at a time, and not with your own Plus', async () => {
    await invitePlusHousehold(owner.db, adult.email);
    await acceptPlusHousehold(adult.db, owner.id);
    // joining Plus takes the adult out of the household
    await joinPlus(adult.db, 'IN', 'monthly');
    expect((await plusMembership(adult.db))!.shared).toBeUndefined();
    expect((await plusHousehold(owner.db)).owned).toBeNull();
    // and with their own Plus, an invite can't be accepted
    await invitePlusHousehold(owner.db, adult.email);
    expect(await failure(acceptPlusHousehold(adult.db, owner.id))).toBe('plus_owned:');
    await leavePlus(adult.db);
    await acceptPlusHousehold(adult.db, owner.id);

    // a second member's invite waits while the adult shares the first one's
    await joinPlus(stranger.db);
    await invitePlusHousehold(stranger.db, adult.email);
    expect(await failure(acceptPlusHousehold(adult.db, stranger.id))).toBe('household_member:');
    expect(await plusMembership(adult.db)).toMatchObject({ shared: { ownerName: 'Household Owner' } });

    // the membership ends, and the sharing with it
    await leavePlus(owner.db);
    expect(await plusMembership(adult.db)).toBeNull();
    expect(await ship(adult)).toBe(599);
    expect((await plusHousehold(adult.db)).shared).toBeNull();
  });

  it('is written only through its functions', async () => {
    await joinPlus(owner.db);
    const forged = await adult.db
      .from('plus_household')
      .insert({ owner_id: owner.id, email: adult.email, member_id: adult.id, joined_at: new Date().toISOString() });
    expect(forged.error).not.toBeNull();
    await invitePlusHousehold(owner.db, stranger.email);
    const hijack = await owner.db.from('plus_household').update({ member_id: adult.id, joined_at: new Date().toISOString() }).eq('owner_id', owner.id).select();
    expect(hijack.error ?? (hijack.data?.length === 0 ? 'no rows' : null)).toBeTruthy();
    expect(await ship(adult)).toBe(599);
    expect((await anon().rpc('plus_household')).error).not.toBeNull();
  });
});
