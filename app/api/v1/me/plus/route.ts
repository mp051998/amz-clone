import { json, noContent, preflight, requireUser, route } from '@/lib/api/http';
import { joinPlus, leavePlus, plusMembership } from '@/lib/data/plus';

/** GET /api/v1/me/plus — the caller's Plus membership: { plus: { since } | null }. */
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

/** DELETE /api/v1/me/plus — end the membership. Orders already placed keep their prices. */
export const DELETE = route(async (ctx) => {
  requireUser(ctx);
  await leavePlus(ctx.db);
  return noContent();
});

export const OPTIONS = preflight;
