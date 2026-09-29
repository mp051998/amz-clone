/**
 * Order-tracking timeline derived from an order's time and status (there is no
 * carrier feed): Order placed → Preparing shipment → Shipped → Out for delivery
 * → Delivered at plausible offsets. Pure — pass `now` for deterministic output.
 */
import type { Order } from '../types';
import type { TrackingStep } from './types';

const HOUR = 3_600_000;

/**
 * Step labels and offsets (hours after the order was placed). The last two are
 * nominal: `plan()` snaps them to daytime in the store's time zone (out for
 * delivery 9:00, delivered 11:30 local) on the first day that leaves ≥ 6 h after shipping.
 */
export const TRACKING_PLAN: readonly { label: string; afterHours: number }[] = [
  { label: 'Order placed', afterHours: 0 },
  { label: 'Preparing shipment', afterHours: 2 },
  { label: 'Shipped', afterHours: 10 },
  { label: 'Out for delivery', afterHours: 34 },
  { label: 'Delivered', afterHours: 38 },
];

const OUT_FOR_DELIVERY = { h: 9, m: 0 };
const DELIVERED = { h: 11, m: 30 };

type OrderLike = Pick<Order, 'status' | 'createdAt'> & { placedAt?: string };

/** IANA zone offset (ms, local − UTC) at instant `t`. */
function zoneOffset(t: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(t));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(t / 1000) * 1000;
}

/** UTC instant of local wall time h:m on the local calendar day containing `t`. */
function atLocal(t: number, h: number, m: number, timeZone: string): number {
  const off = zoneOffset(t, timeZone);
  const local = new Date(t + off);
  const wall = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), h, m);
  return wall - zoneOffset(wall - off, timeZone);
}

/** Step instants for an order placed at `t0`. */
function plan(t0: number, timeZone: string): number[] {
  const [placed, preparing, shipped] = TRACKING_PLAN.slice(0, 3).map((s) => t0 + s.afterHours * HOUR);
  let day = t0 + 24 * HOUR;
  while (atLocal(day, OUT_FOR_DELIVERY.h, OUT_FOR_DELIVERY.m, timeZone) < shipped + 6 * HOUR) day += 24 * HOUR;
  return [
    placed, preparing, shipped,
    atLocal(day, OUT_FOR_DELIVERY.h, OUT_FOR_DELIVERY.m, timeZone),
    atLocal(day, DELIVERED.h, DELIVERED.m, timeZone),
  ];
}

function stateFor(steps: { label: string; at: number }[], now: number): TrackingStep[] {
  const firstFuture = steps.findIndex((s) => s.at > now);
  return steps.map((s, i) => ({
    label: s.label,
    at: new Date(s.at).toISOString(),
    // the last step reached is "current" until the next one happens
    state:
      firstFuture === -1
        ? i === steps.length - 1 ? 'current' : 'done'
        : i < firstFuture - 1 ? 'done' : i === firstFuture - 1 ? 'current' : 'upcoming',
  }));
}

/**
 * Timeline for an order.
 * - `placed`: the five steps; each is done once its time has passed, the latest reached is current
 *   (Delivered becomes current once delivered).
 * - `awaiting_payment`: "Order placed" current, the rest upcoming (times are estimates if paid now).
 * - `cancelled`: "Order placed" done, then "Cancelled" current.
 */
export function trackingSteps(order: OrderLike, now: Date = new Date(), timeZone = 'UTC'): TrackingStep[] {
  const base = Date.parse(order.placedAt ?? order.createdAt);
  const t0 = Number.isFinite(base) ? base : now.getTime();
  if (order.status === 'cancelled') {
    return [
      { label: 'Order placed', at: new Date(t0).toISOString(), state: 'done' },
      { label: 'Cancelled', at: new Date(Math.max(t0, Math.min(now.getTime(), t0 + HOUR))).toISOString(), state: 'current' },
    ];
  }
  if (order.status === 'awaiting_payment') {
    const times = plan(now.getTime(), timeZone);
    return TRACKING_PLAN.map((s, i) => ({
      label: s.label,
      at: new Date(i === 0 ? t0 : times[i]).toISOString(),
      state: i === 0 ? 'current' : 'upcoming',
    }));
  }
  const times = plan(t0, timeZone);
  return stateFor(
    TRACKING_PLAN.map((s, i) => ({ label: s.label, at: times[i] })),
    now.getTime(),
  );
}

/** Expected (or actual) delivery time, ISO — null for cancelled orders. */
export function deliveryEta(order: OrderLike, now: Date = new Date(), timeZone = 'UTC'): string | null {
  if (order.status === 'cancelled') return null;
  const steps = trackingSteps(order, now, timeZone);
  return steps[steps.length - 1]?.at ?? null;
}

/** True once the Delivered step has happened. */
export function isDelivered(order: OrderLike, now: Date = new Date(), timeZone = 'UTC'): boolean {
  if (order.status !== 'placed') return false;
  const steps = trackingSteps(order, now, timeZone);
  const last = steps[steps.length - 1];
  return !!last && Date.parse(last.at) <= now.getTime();
}
