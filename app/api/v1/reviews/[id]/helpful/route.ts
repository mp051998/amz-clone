import { json, preflight, requireUser, route } from '@/lib/api/http';
import { toggleHelpful } from '@/lib/data/reviews';

/** POST /api/v1/reviews/:id/helpful — toggle the caller's helpful vote; returns the new state + count. */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  return json(await toggleHelpful(ctx.db, id));
});

export const OPTIONS = preflight;
