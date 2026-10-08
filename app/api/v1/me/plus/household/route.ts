import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { endPlusHousehold, invitePlusHousehold, plusHousehold } from '@/lib/data/plus-household';

/**
 * GET /api/v1/me/plus/household — the caller's Plus Household: { household: { owned, shared,
 * invites } }. `owned` is the sharing of their own membership ({ email, memberName?, invitedAt,
 * joinedAt? }), `shared` the membership they share ({ ownerName?, since }), `invites` the invites
 * waiting for them ([{ ownerId, ownerName?, invitedAt }]).
 */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  return json({ household: await plusHousehold(ctx.db) });
});

/**
 * POST /api/v1/me/plus/household `{ email }` — invite an adult to share the caller's Plus
 * delivery benefits; replaces an invite still waiting. 201 with the household. `403
 * plus_required` without their own Plus; `422 invalid_input` (detail "email") for the caller's
 * own email or one that isn't an email; `409 household_full` once someone has joined.
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const { email } = await body(ctx.req);
  if (typeof email !== 'string' || !email.trim()) throw new DataError('invalid_input', 'email', 'Send email: the address to invite.');
  return json({ household: await invitePlusHousehold(ctx.db, email) }, { status: 201 });
});

/**
 * DELETE /api/v1/me/plus/household — end the caller's household: a member cancels their invite
 * or stops sharing, and the adult they share with leaves. Returns the household.
 */
export const DELETE = route(async (ctx) => {
  requireUser(ctx);
  return json({ household: await endPlusHousehold(ctx.db) });
});

export const OPTIONS = preflight;
