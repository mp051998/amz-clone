import { adminOnly } from '@/lib/api/admin';
import { json, preflight, route } from '@/lib/api/http';
import { assertStoreReview, moderateReview } from '@/lib/data/admin-reviews';
import { DataError } from '@/lib/data/errors';

const ACTIONS = ['keep', 'hide'] as const;

/**
 * POST /api/v1/admin/reviews/:id/{keep,hide}
 * - keep: visible again; reports filed so far are resolved (three new ones hide it again).
 * - hide: hidden from shoppers by an admin until kept.
 */
export const POST = route<{ id: string; action: string }>(async (ctx, { id, action }) => {
  await adminOnly(ctx);
  if (!(ACTIONS as readonly string[]).includes(action)) throw new DataError('not_found');
  await assertStoreReview(ctx.db, ctx.market, id);
  return json({ review: await moderateReview(ctx.db, id, action as (typeof ACTIONS)[number]) });
});

export const OPTIONS = preflight;
