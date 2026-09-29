import { adminOnly } from '@/lib/api/admin';
import { json, preflight, route } from '@/lib/api/http';
import { assertStoreReview, moderateReview } from '@/lib/data/admin-reviews';

/** DELETE /api/v1/admin/reviews/:id — remove a review of this store, with its votes and reports. */
export const DELETE = route<{ id: string }>(async (ctx, { id }) => {
  await adminOnly(ctx);
  await assertStoreReview(ctx.db, ctx.market, id);
  return json({ review: await moderateReview(ctx.db, id, 'delete') });
});

export const OPTIONS = preflight;
