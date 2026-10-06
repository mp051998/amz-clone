import { json, preflight, requireUser, route } from '@/lib/api/http';
import { toggleAnswerHelpful } from '@/lib/data/questions';

/** POST /api/v1/answers/:id/helpful — toggle the caller's helpful vote on someone else's answer; returns the new state + count. */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  return json(await toggleAnswerHelpful(ctx.db, id));
});

export const OPTIONS = preflight;
