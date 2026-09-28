import { noContent, preflight, requireUser, route } from '@/lib/api/http';
import { deleteReview } from '@/lib/data/reviews';

/** DELETE /api/v1/reviews/:id — remove the caller's own review (RLS rejects anyone else's). */
export const DELETE = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  await deleteReview(ctx.db, id);
  return noContent();
});

export const OPTIONS = preflight;
