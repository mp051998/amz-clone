import { adminOnly } from '@/lib/api/admin';
import { body, json, preflight, route } from '@/lib/api/http';
import { decideClaim, getClaim } from '@/lib/data/atoz-claims';
import { DataError } from '@/lib/data/errors';

const ACTIONS = ['grant', 'deny'] as const;

/**
 * POST /api/v1/admin/claims/:id/{grant,deny} `{ note? }` — decide a claim under review.
 * - grant: refunds what's left of the seller's items in the order at once, as a received return
 *   with reason `atoz_claim` (card: on Stripe, see `claim.refund.status`). `409 claim_not_allowed`
 *   (`nothing_left`) when all of it has been returned or refunded since.
 * - deny: `note` (≤ 1,000 chars) is required; the shopper sees it.
 * `409 claim_not_open` once decided or withdrawn.
 */
export const POST = route<{ id: string; action: string }>(async (ctx, { id, action }) => {
  await adminOnly(ctx);
  if (!(ACTIONS as readonly string[]).includes(action)) throw new DataError('not_found');
  const claim = await getClaim(ctx.db, id);
  if (!claim || claim.market !== ctx.market) throw new DataError('claim_not_found');
  return json({ claim: await decideClaim(ctx.db, id, action, (await body(ctx.req)).note) });
});

export const OPTIONS = preflight;
