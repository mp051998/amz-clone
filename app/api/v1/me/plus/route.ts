import { body, json, noContent, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { isWeekday } from '@/lib/delivery-day';
import { joinPlus, leavePlus, plusMembership, setDeliveryDay, setPlusPlan, setPlusRenewal } from '@/lib/data/plus';
import { isPlusPlanId } from '@/lib/plus-plans';

/**
 * GET /api/v1/me/plus — the caller's Plus membership:
 * { plus: { since, market, plan, nextPlan?, renewsAt, autoRenew, deliveryDay? } | null }.
 */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  return json({ plus: await plusMembership(ctx.db) });
});

/**
 * POST /api/v1/me/plus — join Plus (a demo: nothing is billed) on one of the store's plans,
 * `{ plan?: "monthly" | "quarterly" | "annual" }` (monthly when left out; 3 months is amazon.in
 * only). Members get FREE delivery on every order and FREE faster delivery, in both stores.
 * Joining again is a no-op.
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const plan = (await body(ctx.req)).plan;
  if (plan !== undefined && !isPlusPlanId(plan)) {
    throw new DataError('invalid_input', 'plan', 'Send plan: "monthly", "quarterly" or "annual".');
  }
  return json({ plus: await joinPlus(ctx.db, ctx.market, plan) });
});

/**
 * PATCH /api/v1/me/plus — change the membership, any of:
 *   - `deliveryDay`: a weekday 1–7 (ISO, 1 = Monday), or null to turn it off (US store only at checkout);
 *   - `plan`: the plan from the next renewal on (the current plan cancels a switch);
 *   - `autoRenew`: false ends the membership when its period does, true renews it again.
 * Members only (`403 plus_required`). Returns the membership.
 */
export const PATCH = route(async (ctx) => {
  requireUser(ctx);
  const input = await body(ctx.req);
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);
  if (!has('deliveryDay') && !has('plan') && !has('autoRenew')) {
    throw new DataError('invalid_input', 'body', 'Send deliveryDay, plan or autoRenew.');
  }
  const day = input.deliveryDay;
  if (has('deliveryDay') && day !== null && !isWeekday(day)) {
    throw new DataError('invalid_input', 'deliveryDay', 'Send deliveryDay: a weekday from 1 (Monday) to 7 (Sunday), or null.');
  }
  if (has('plan') && !isPlusPlanId(input.plan)) {
    throw new DataError('invalid_input', 'plan', 'Send plan: "monthly", "quarterly" or "annual".');
  }
  if (has('autoRenew') && typeof input.autoRenew !== 'boolean') {
    throw new DataError('invalid_input', 'autoRenew', 'Send autoRenew: true or false.');
  }
  if (has('deliveryDay')) await setDeliveryDay(ctx.db, day as number | null);
  if (isPlusPlanId(input.plan)) await setPlusPlan(ctx.db, input.plan);
  if (typeof input.autoRenew === 'boolean') await setPlusRenewal(ctx.db, input.autoRenew);
  return json({ plus: await plusMembership(ctx.db) });
});

/** DELETE /api/v1/me/plus — end the membership at once. Orders already placed keep their prices. */
export const DELETE = route(async (ctx) => {
  requireUser(ctx);
  await leavePlus(ctx.db);
  return noContent();
});

export const OPTIONS = preflight;
