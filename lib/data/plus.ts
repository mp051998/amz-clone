import type { Db } from '../db/client';
import { isPlusPlanId, type PlusPlanId } from '../plus-plans';
import type { Market } from '../types';
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
  /** the store the membership is billed in, whose plans it's on */
  market: Market;
  plan: PlusPlanId;
  /** the plan from the next renewal on, when the member has switched */
  nextPlan?: PlusPlanId;
  /** when the period ends (ISO timestamp): the membership renews then, or ends if `autoRenew` is off */
  renewsAt?: string;
  autoRenew: boolean;
  /**
   * present when the membership is shared with the caller by a member of their household (Plus
   * Household): the plan and renewal are that member's, and so is Delivery Day
   */
  shared?: { ownerName?: string };
}

type Row = {
  joined_at: string;
  delivery_day?: number | null;
  market_id?: string;
  plan?: string;
  next_plan?: string | null;
  renews_at?: string;
  auto_renew?: boolean;
};

// the plan and renewal columns are absent before the Plus plans migration lands
function toPlus(row: Row): PlusMembership {
  return {
    since: row.joined_at,
    ...(row.delivery_day ? { deliveryDay: row.delivery_day } : {}),
    market: row.market_id === 'IN' ? 'IN' : 'US',
    plan: isPlusPlanId(row.plan) ? row.plan : 'monthly',
    ...(isPlusPlanId(row.next_plan) ? { nextPlan: row.next_plan } : {}),
    ...(row.renews_at ? { renewsAt: row.renews_at } : {}),
    autoRenew: row.auto_renew ?? true,
  };
}

/** The membership a household member shares with the caller, as `plus_household()` returns it. */
type SharedRow = Row & { owner_name?: string | null };

/**
 * The caller's membership, or the one a member of their household shares with them (`shared`),
 * or null (signed out, not a member, or not readable yet).
 */
export async function plusMembership(db: Db): Promise<PlusMembership | null> {
  const { data, error } = await db.from('plus_members').select('*').maybeSingle();
  if (error) return null;
  if (data) return toPlus(data);
  const household = await db.rpc('plus_household');
  const shared = household.error ? null : (household.data as { shared?: SharedRow | null } | null)?.shared;
  if (!shared) return null;
  const { owner_name, ...row } = shared;
  return { ...toPlus({ ...row, delivery_day: null }), shared: owner_name ? { ownerName: owner_name } : {} };
}

/**
 * Join Plus on one of the store's plans (monthly by default; `422 invalid_input`, detail
 * "plan", for one it doesn't sell). Joining again changes nothing.
 */
export async function joinPlus(db: Db, market: Market = 'US', plan: PlusPlanId = 'monthly'): Promise<PlusMembership> {
  return toPlus(unwrap(await db.rpc('join_plus', { p_market: market, p_plan: plan })) as Row);
}

/**
 * Switch plans from the next renewal on; the current plan cancels a switch. Members only
 * (`403 plus_required`); a plan the membership's store doesn't sell is `422 invalid_input`.
 */
export async function setPlusPlan(db: Db, plan: PlusPlanId): Promise<PlusMembership> {
  return toPlus(unwrap(await db.rpc('set_plus_plan', { p_plan: plan })) as Row);
}

/**
 * Turn renewal on or off. Off, the membership ends when its period does, with every benefit
 * until then. Members only (`403 plus_required`).
 */
export async function setPlusRenewal(db: Db, renew: boolean): Promise<PlusMembership> {
  return toPlus(unwrap(await db.rpc('set_plus_renewal', { p_renew: renew })) as Row);
}

/**
 * Set the caller's Delivery Day (ISO weekday, 1 = Monday), or turn it off with null. Plus members
 * only (`403 plus_required`); a day outside 1–7 is `422 invalid_input` (`detail: "day"`).
 */
export async function setDeliveryDay(db: Db, day: number | null): Promise<number | null> {
  const json = unwrap(await db.rpc('set_delivery_day', { p_day: day })) as { delivery_day: number | null };
  return json.delivery_day;
}

/** End the caller's membership at once. Orders already placed keep their prices. */
export async function leavePlus(db: Db): Promise<void> {
  unwrap(await db.rpc('leave_plus'));
}
