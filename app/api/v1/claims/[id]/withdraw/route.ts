import { json, preflight, requireUser, route } from '@/lib/api/http';
import { withdrawClaim } from '@/lib/data/atoz-claims';

/**
 * POST /api/v1/claims/:id/withdraw — withdraw your A-to-z Guarantee claim while it's under review
 * (it can be filed again). `409 claim_not_open` once it's decided or withdrawn; `404
 * claim_not_found` for someone else's.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  return json({ claim: await withdrawClaim(ctx.db, id) });
});

export const OPTIONS = preflight;
