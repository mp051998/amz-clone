import { body, json, noContent, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { isWeekday } from '@/lib/delivery-day';
import { joinPlus, leavePlus, plusMembership, setDeliveryDay } from '@/lib/data/plus';

/** GET /api/v1/me/plus — the caller's Plus membership: { plus: { since, deliveryDay? } | null }. */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  return json({ plus: await plusMembership(ctx.db) });
});

/**
 * POST /api/v1/me/plus — join Plus (a demo: nothing is billed). Members get FREE delivery
 * on every order and FREE faster delivery, in both stores. Joining again is a no-op.
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  return json({ plus: await joinPlus(ctx.db) });
});

/**
 * PATCH /api/v1/me/plus — set the member's Delivery Day, `{ deliveryDay: 1–7 }` (ISO weekday,
 * 1 = Monday), or turn it off with `{ deliveryDay: null }`. US store only at checkout; members
 * only (`403 plus_required`). Returns the membership.
 */
export const PATCH = route(async (ctx) => {
  requireUser(ctx);
  const day = (await body(ctx.req)).deliveryDay;
  if (day !== null && !isWeekday(day)) {
    throw new DataError('invalid_input', 'deliveryDay', 'Send deliveryDay: a weekday from 1 (Monday) to 7 (Sunday), or null.');
  }
  await setDeliveryDay(ctx.db, day);
  return json({ plus: await plusMembership(ctx.db) });
});

/** DELETE /api/v1/me/plus — end the membership. Orders already placed keep their prices. */
export const DELETE = route(async (ctx) => {
  requireUser(ctx);
  await leavePlus(ctx.db);
  return noContent();
});

export const OPTIONS = preflight;
