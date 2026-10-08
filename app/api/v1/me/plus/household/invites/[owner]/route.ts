import { json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { acceptPlusHousehold, declinePlusHousehold } from '@/lib/data/plus-household';
import { isUuid } from '@/lib/data/collections';

function owner(id: string): string {
  if (!isUuid(id)) throw new DataError('invite_not_found');
  return id;
}

/**
 * POST /api/v1/me/plus/household/invites/:owner — accept the invite the member `owner` sent to
 * the caller's email, sharing their Plus from now on. Returns the household. `404
 * invite_not_found` when it isn't waiting; `409 plus_owned` with their own Plus; `409
 * household_member` when they already share someone's.
 */
export const POST = route<{ owner: string }>(async (ctx, params) => {
  requireUser(ctx);
  return json({ household: await acceptPlusHousehold(ctx.db, owner(params.owner)) });
});

/** DELETE /api/v1/me/plus/household/invites/:owner — decline that invite. Returns the household. */
export const DELETE = route<{ owner: string }>(async (ctx, params) => {
  requireUser(ctx);
  return json({ household: await declinePlusHousehold(ctx.db, owner(params.owner)) });
});

export const OPTIONS = preflight;
