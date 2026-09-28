import { body, noContent, preflight, requireUser, route } from '@/lib/api/http';
import { reportReview } from '@/lib/data/reviews';

/** POST /api/v1/reviews/:id/report { reason?: spam | offensive | off_topic | other } */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const { reason } = await body(ctx.req);
  await reportReview(ctx.db, id, reason);
  return noContent();
});

export const OPTIONS = preflight;
