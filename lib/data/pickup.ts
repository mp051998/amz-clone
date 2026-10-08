import type { Db } from '../db/client';
import type { Market, PickupPoint } from '../types';
import { unwrap } from './errors';

/**
 * Pickup points (Hub Locker and Hub Counter): places in a store where a shopper can collect an
 * order with a pickup code instead of having it brought to an address. Anyone can read them;
 * place_order checks the one chosen.
 */

export type PickupRow = {
  id: string;
  kind: string;
  name: string;
  line1: string;
  city: string;
  state: string;
  postcode: string;
  hours: string;
  hold_days: number;
};

export function toPickupPoint(r: PickupRow): PickupPoint {
  return {
    id: r.id,
    kind: r.kind === 'counter' ? 'counter' : 'locker',
    name: r.name,
    line1: r.line1,
    city: r.city,
    state: r.state,
    postcode: r.postcode,
    hours: r.hours,
    holdDays: r.hold_days,
  };
}

/**
 * The store's pickup points that take orders, by city then name; `q` keeps those whose name,
 * street, city or postcode contains it. Empty before the pickup migration lands.
 */
export async function listPickupPoints(db: Db, market: Market, q = ''): Promise<PickupPoint[]> {
  const { data, error } = await db.from('pickup_points').select('*').eq('market_id', market).eq('active', true).order('city').order('name');
  if (error || !data) return [];
  const needle = q.trim().toLowerCase();
  const points = data.map(toPickupPoint);
  return needle ? points.filter((p) => [p.name, p.line1, p.city, p.postcode].some((f) => f.toLowerCase().includes(needle))) : points;
}

/** One pickup point in the store (taken out of service or not, so orders can still show theirs). */
export async function getPickupPoint(db: Db, market: Market, id: string): Promise<PickupPoint | null> {
  const row = unwrap(await db.from('pickup_points').select('*').eq('market_id', market).eq('id', id).maybeSingle());
  return row ? toPickupPoint(row) : null;
}

/** The last day an order that was ready at `readyAt` waits at its pickup point. */
export function pickupBy(readyAt: string | Date, holdDays: number): Date {
  return new Date(new Date(readyAt).getTime() + holdDays * 86_400_000);
}
