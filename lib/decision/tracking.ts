/**
 * Order-tracking timeline: Order placed → Preparing shipment → Shipped → Out for delivery
 * → Delivered. Placed orders carry a saved schedule (`shippedAt`, `outForDeliveryAt`,
 * `deliveredAt`, filled by the database and moved by admins); without one (unpaid orders,
 * rows from before the lifecycle migration) the same plan is computed here. There is no
 * carrier feed. Pure — pass `now` for deterministic output.
 */
import type { Order, OrderStage, ShipSpeed } from '../types';
import type { TrackingStep } from './types';

const HOUR = 3_600_000;

/**
 * Step labels and offsets (hours after the order was placed). The last two are
 * nominal: `deliveryAfter()` snaps them to daytime in the store's time zone (out for
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

/** Fast delivery: ships 3 h after the order, then the evening run (out 17:00, delivered 19:30 local). */
const FAST_SHIP_HOURS = 3;
const FAST_OUT = { h: 17, m: 0 };
const FAST_DELIVERED = { h: 19, m: 30 };

type OrderLike = Pick<Order, 'status' | 'createdAt'> &
  Partial<Pick<Order, 'placedAt' | 'shippedAt' | 'outForDeliveryAt' | 'deliveredAt' | 'cancelledAt' | 'shipSpeed' | 'deliveryDay' | 'pickup' | 'releaseAt'>>;

/** The steps' labels: a pickup order's last one is "Ready for pickup" rather than "Delivered". */
function labelsFor(order: OrderLike): string[] {
  return TRACKING_PLAN.map((s, i) => (order.pickup && i === TRACKING_PLAN.length - 1 ? 'Ready for pickup' : s.label));
}

type Ymd = [year: number, month: number, day: number];

/** IANA zone offset (ms, local − UTC) at instant `t`. */
function zoneOffset(t: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(t));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(t / 1000) * 1000;
}

/** Local calendar day containing instant `t`. */
function localDay(t: number, timeZone: string): Ymd {
  const local = new Date(t + zoneOffset(t, timeZone));
  return [local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()];
}

/** UTC instant of local wall time h:m on day `[y, m, d]` (the day may overflow the month). */
function wallTime([y, mo, d]: Ymd, h: number, m: number, timeZone: string): number {
  const wall = Date.UTC(y, mo, d, h, m);
  return wall - zoneOffset(wall - zoneOffset(wall, timeZone), timeZone);
}

/** Local midnight (ISO) starting the day `ymd` ("2026-11-20") in the time zone. */
export function localDayStart(ymd: string, timeZone: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(wallTime([y, m - 1, d], 0, 0, timeZone)).toISOString();
}

/** The local day ("2026-11-20") an instant (ISO) falls on in the time zone. */
export function localDayOf(iso: string, timeZone: string): string {
  const [y, m, d] = localDay(Date.parse(iso), timeZone);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Out for delivery (9:00 local) and delivered (11:30 local) for a parcel shipped at `shipped`:
 * the first local day, counted from `shipped + 14 h`, whose 9:00 is ≥ 6 h after shipping.
 * Mirrors the database's `private.delivery_after`.
 */
export function deliveryAfter(shipped: number, timeZone: string): { outForDelivery: number; delivered: number } {
  const [y, m, d] = localDay(shipped + 14 * HOUR, timeZone);
  let k = 0;
  while (wallTime([y, m, d + k], OUT_FOR_DELIVERY.h, OUT_FOR_DELIVERY.m, timeZone) < shipped + 6 * HOUR) k++;
  return {
    outForDelivery: wallTime([y, m, d + k], OUT_FOR_DELIVERY.h, OUT_FOR_DELIVERY.m, timeZone),
    delivered: wallTime([y, m, d + k], DELIVERED.h, DELIVERED.m, timeZone),
  };
}

/**
 * The evening run for a fast parcel shipped at `shipped`: the first local day whose 17:00 is
 * ≥ 2 h after shipping, delivered 19:30. Mirrors the database's `private.fast_delivery_after`.
 */
export function fastDeliveryAfter(shipped: number, timeZone: string): { outForDelivery: number; delivered: number } {
  const [y, m, d] = localDay(shipped, timeZone);
  let k = 0;
  while (wallTime([y, m, d + k], FAST_OUT.h, FAST_OUT.m, timeZone) < shipped + 2 * HOUR) k++;
  return {
    outForDelivery: wallTime([y, m, d + k], FAST_OUT.h, FAST_OUT.m, timeZone),
    delivered: wallTime([y, m, d + k], FAST_DELIVERED.h, FAST_DELIVERED.m, timeZone),
  };
}

/**
 * Delivery Day: an order placed at `placed` arrives on ISO weekday `day` (1 = Monday), the first
 * one on or after standard delivery's day, on the same morning run; it ships 18:00 the evening
 * before, or as standard does when that's the same day. Mirrors `private.delivery_day_after`.
 */
export function deliveryDayAfter(placed: number, day: number, timeZone: string): { shipped: number; outForDelivery: number; delivered: number } {
  const standardShipped = placed + TRACKING_PLAN[2].afterHours * HOUR;
  const [y, m, d] = localDay(deliveryAfter(standardShipped, timeZone).outForDelivery, timeZone);
  const isoDay = ((new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7) + 1;
  const k = (((day - isoDay) % 7) + 7) % 7;
  const outForDelivery = wallTime([y, m, d + k], OUT_FOR_DELIVERY.h, OUT_FOR_DELIVERY.m, timeZone);
  return {
    shipped: Math.max(standardShipped, outForDelivery - 15 * HOUR),
    outForDelivery,
    delivered: wallTime([y, m, d + k], DELIVERED.h, DELIVERED.m, timeZone),
  };
}

/** Ship, out-for-delivery and delivered instants for an order placed at `t0` with this speed. */
function plan(t0: number, timeZone: string, speed: ShipSpeed = 'standard', day?: number): [shipped: number, out: number, delivered: number] {
  if (speed === 'day' && day) {
    const { shipped, outForDelivery, delivered } = deliveryDayAfter(t0, day, timeZone);
    return [shipped, outForDelivery, delivered];
  }
  if (speed === 'fast') {
    const shipped = t0 + FAST_SHIP_HOURS * HOUR;
    const { outForDelivery, delivered } = fastDeliveryAfter(shipped, timeZone);
    return [shipped, outForDelivery, delivered];
  }
  const shipped = t0 + TRACKING_PLAN[2].afterHours * HOUR;
  const { outForDelivery, delivered } = deliveryAfter(shipped, timeZone);
  return [shipped, outForDelivery, delivered];
}

/**
 * When a cart checked out at `now` would arrive with each speed (ISO). `fast` is null when it
 * wouldn't beat standard delivery (so it isn't offered); matches `private.fast_delivery_offered`.
 * `fastBy` is the last moment an order still gets that fast delivery (the run's day, 17:00 less
 * the 3 h to ship and the 2 h before the van leaves: noon). `day` is when it would come on the
 * Delivery Day `deliveryDay` (ISO weekday), null without one. With `release` (ISO) still to come
 * — a pre-order — everything runs from the release instead, and fast delivery isn't offered.
 */
export function deliveryOptions(
  now: Date,
  timeZone: string,
  deliveryDay?: number | null,
  release?: string | null,
): { standard: string; fast: string | null; fastBy: string | null; day: string | null } {
  const from = Math.max(now.getTime(), release ? Date.parse(release) || 0 : 0);
  const standard = plan(from, timeZone)[2];
  const fast = plan(from, timeZone, 'fast')[2];
  const day = deliveryDay ? new Date(plan(from, timeZone, 'day', deliveryDay)[2]).toISOString() : null;
  if (fast >= standard || from > now.getTime()) return { standard: new Date(standard).toISOString(), fast: null, fastBy: null, day };
  const by = wallTime(localDay(fast, timeZone), FAST_OUT.h, FAST_OUT.m, timeZone) - (FAST_SHIP_HOURS + 2) * HOUR;
  return { standard: new Date(standard).toISOString(), fast: new Date(fast).toISOString(), fastBy: new Date(by).toISOString(), day };
}

/** Schedule the database saves for an order placed at `placedAt` (ISO). */
export function plannedSchedule(
  placedAt: string,
  timeZone: string,
  speed: ShipSpeed = 'standard',
  deliveryDay?: number,
): { shippedAt: string; outForDeliveryAt: string; deliveredAt: string } {
  const [shipped, outForDelivery, delivered] = plan(Date.parse(placedAt), timeZone, speed, deliveryDay);
  return {
    shippedAt: new Date(shipped).toISOString(),
    outForDeliveryAt: new Date(outForDelivery).toISOString(),
    deliveredAt: new Date(delivered).toISOString(),
  };
}

/**
 * Step instants: the saved schedule when the order has one, else the plan from `t0` — or, for a
 * pre-order, from its release (as `orders_fill_schedule` does), where preparing starts too.
 */
function stepTimes(order: OrderLike, t0: number, timeZone: string): number[] {
  const release = order.releaseAt ? Date.parse(order.releaseAt) : NaN;
  const from = Number.isFinite(release) ? Math.max(t0, release) : t0;
  const saved = [order.shippedAt, order.outForDeliveryAt, order.deliveredAt].map((s) => (s ? Date.parse(s) : NaN));
  const [shipped, out, delivered] = saved.every(Number.isFinite) ? saved : plan(from, timeZone, order.shipSpeed, order.deliveryDay);
  return [t0, Math.min(from + TRACKING_PLAN[1].afterHours * HOUR, shipped), shipped, out, delivered];
}

function startOf(order: OrderLike, now: Date): number {
  const base = Date.parse(order.placedAt ?? order.createdAt);
  return Number.isFinite(base) ? base : now.getTime();
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
  const t0 = startOf(order, now);
  if (order.status === 'cancelled') {
    const saved = order.cancelledAt ? Date.parse(order.cancelledAt) : NaN;
    const at = Number.isFinite(saved) ? saved : Math.max(t0, Math.min(now.getTime(), t0 + HOUR));
    return [
      { label: 'Order placed', at: new Date(t0).toISOString(), state: 'done' },
      { label: 'Cancelled', at: new Date(at).toISOString(), state: 'current' },
    ];
  }
  if (order.status === 'awaiting_payment') {
    const times = stepTimes({ status: 'placed', createdAt: order.createdAt, shipSpeed: order.shipSpeed, deliveryDay: order.deliveryDay, releaseAt: order.releaseAt }, now.getTime(), timeZone);
    const labels = labelsFor(order);
    return TRACKING_PLAN.map((_, i) => ({
      label: labels[i],
      at: new Date(i === 0 ? t0 : times[i]).toISOString(),
      state: i === 0 ? 'current' : 'upcoming',
    }));
  }
  const times = stepTimes(order, t0, timeZone);
  const labels = labelsFor(order);
  return stateFor(
    TRACKING_PLAN.map((_, i) => ({ label: labels[i], at: times[i] })),
    now.getTime(),
  );
}

/** Where an order is now; matches the database's `private.order_stage`. */
export function orderStage(order: OrderLike, now: Date = new Date(), timeZone = 'UTC'): OrderStage {
  if (order.status !== 'placed') return order.status;
  const [, , shipped, out, delivered] = stepTimes(order, startOf(order, now), timeZone);
  const t = now.getTime();
  if (delivered <= t) return 'delivered';
  if (out <= t) return 'out_for_delivery';
  if (shipped <= t) return 'shipped';
  return 'preparing';
}

/**
 * Until when the shopper may cancel (ISO; the saved ship time), or null when they can't:
 * not placed, already shipped, or no saved schedule yet.
 */
export function cancellableUntil(order: OrderLike, now: Date = new Date()): string | null {
  if (order.status !== 'placed' || !order.shippedAt) return null;
  return Date.parse(order.shippedAt) > now.getTime() ? order.shippedAt : null;
}

/** Expected (or actual) delivery time, ISO — null for cancelled orders. */
export function deliveryEta(order: OrderLike, now: Date = new Date(), timeZone = 'UTC'): string | null {
  if (order.status === 'cancelled') return null;
  const steps = trackingSteps(order, now, timeZone);
  return steps[steps.length - 1]?.at ?? null;
}

/** True once the Delivered step has happened. */
export function isDelivered(order: OrderLike, now: Date = new Date(), timeZone = 'UTC'): boolean {
  return orderStage(order, now, timeZone) === 'delivered';
}
