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
  /** their Delivery Day (ISO weekday, 1 = Monday), absent when they haven't picked one */
  deliveryDay?: number;
}

/** The caller's membership, or null (signed out, not a member, or not readable yet). */
export async function plusMembership(db: Db): Promise<PlusMembership | null> {
  const { data, error } = await db.from('plus_members').select('*').maybeSingle();
  // delivery_day is absent before the Delivery Day migration lands
  return error || !data ? null : { since: data.joined_at, ...(data.delivery_day ? { deliveryDay: data.delivery_day } : {}) };
}

/** Join Plus. Joining again keeps the original join date. */
export async function joinPlus(db: Db): Promise<PlusMembership> {
  const json = unwrap(await db.rpc('join_plus')) as { joined_at: string };
  return { since: json.joined_at };
}

/**
 * Set the caller's Delivery Day (ISO weekday, 1 = Monday), or turn it off with null. Plus members
 * only (`403 plus_required`); a day outside 1–7 is `422 invalid_input` (`detail: "day"`).
 */
export async function setDeliveryDay(db: Db, day: number | null): Promise<number | null> {
  const json = unwrap(await db.rpc('set_delivery_day', { p_day: day })) as { delivery_day: number | null };
  return json.delivery_day;
}

/** End the caller's membership. Orders already placed keep their prices. */
export async function leavePlus(db: Db): Promise<void> {
  unwrap(await db.rpc('leave_plus'));
}
