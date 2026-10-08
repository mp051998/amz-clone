import type { Db } from '../db/client';
import { unwrap } from './errors';

/**
 * Plus Household (a demo, never billed): a Plus member shares their delivery benefits — FREE
 * delivery on every order and FREE faster delivery — with one other adult, invited by email. The
 * database counts that adult as a member wherever it prices delivery (`plusMembership` returns
 * the shared membership); this module reads and changes the sharing.
 */

export interface PlusHousehold {
  /** the sharing of the caller's own membership: who's invited, and their name once they've joined */
  owned: { email: string; memberName?: string; invitedAt: string; joinedAt?: string } | null;
  /** the membership the caller shares: whose (their name, when they've set one) and since when */
  shared: { ownerName?: string; since: string } | null;
  /** invites waiting for the caller, newest first */
  invites: { ownerId: string; ownerName?: string; invitedAt: string }[];
}

export const NO_HOUSEHOLD: PlusHousehold = { owned: null, shared: null, invites: [] };

type Json = {
  owned?: { email: string; member_name?: string | null; invited_at: string; joined_at?: string | null } | null;
  shared?: { owner_name?: string | null; joined_at: string } | null;
  invites?: { owner_id: string; owner_name?: string | null; invited_at: string }[] | null;
};

function toHousehold(json: Json | null): PlusHousehold {
  const { owned, shared, invites } = json ?? {};
  return {
    owned: owned
      ? {
          email: owned.email,
          ...(owned.member_name ? { memberName: owned.member_name } : {}),
          invitedAt: owned.invited_at,
          ...(owned.joined_at ? { joinedAt: owned.joined_at } : {}),
        }
      : null,
    shared: shared ? { ...(shared.owner_name ? { ownerName: shared.owner_name } : {}), since: shared.joined_at } : null,
    invites: (invites ?? []).map((i) => ({ ownerId: i.owner_id, ...(i.owner_name ? { ownerName: i.owner_name } : {}), invitedAt: i.invited_at })),
  };
}

/** The caller's household (signed in only). */
export async function plusHousehold(db: Db): Promise<PlusHousehold> {
  return toHousehold(unwrap(await db.rpc('plus_household')) as Json);
}

/**
 * Invite an adult, by email, to share the caller's Plus; replaces an invite still waiting.
 * Members with their own Plus only (`403 plus_required`); the caller's own email or one that
 * isn't an email is `422 invalid_input` (detail "email"); `409 household_full` once someone has
 * joined.
 */
export async function invitePlusHousehold(db: Db, email: string): Promise<PlusHousehold> {
  return toHousehold(unwrap(await db.rpc('invite_plus_household', { p_email: email })) as Json);
}

/**
 * Accept the invite from `ownerId`, sent to the caller's email: `404 invite_not_found` when it
 * isn't waiting; `409 plus_owned` with their own Plus; `409 household_member` when they already
 * share someone's.
 */
export async function acceptPlusHousehold(db: Db, ownerId: string): Promise<PlusHousehold> {
  return toHousehold(unwrap(await db.rpc('accept_plus_household', { p_owner: ownerId })) as Json);
}

/** Decline the invite from `ownerId` (a no-op when there's none). */
export async function declinePlusHousehold(db: Db, ownerId: string): Promise<PlusHousehold> {
  return toHousehold(unwrap(await db.rpc('decline_plus_household', { p_owner: ownerId })) as Json);
}

/**
 * End the caller's household: a member cancels their invite or stops sharing, and the adult
 * they share with leaves.
 */
export async function endPlusHousehold(db: Db): Promise<PlusHousehold> {
  return toHousehold(unwrap(await db.rpc('end_plus_household')) as Json);
}
