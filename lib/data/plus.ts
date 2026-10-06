import type { Db } from '../db/client';
import { unwrap } from './errors';

/**
 * Plus membership (a demo, never billed). Members get FREE delivery on every
 * order and FREE faster delivery; the database applies both when it prices a
 * cart or an order, so this module only reads and changes the membership.
 */

export interface PlusMembership {
  /** When the caller joined (ISO timestamp). */
  since: string;
}

/** The caller's membership, or null (signed out, not a member, or not readable yet). */
export async function plusMembership(db: Db): Promise<PlusMembership | null> {
  const { data, error } = await db.from('plus_members').select('joined_at').maybeSingle();
  return error || !data ? null : { since: data.joined_at };
}

/** Join Plus. Joining again keeps the original join date. */
export async function joinPlus(db: Db): Promise<PlusMembership> {
  const json = unwrap(await db.rpc('join_plus')) as { joined_at: string };
  return { since: json.joined_at };
}

/** End the caller's membership. Orders already placed keep their prices. */
export async function leavePlus(db: Db): Promise<void> {
  unwrap(await db.rpc('leave_plus'));
}
