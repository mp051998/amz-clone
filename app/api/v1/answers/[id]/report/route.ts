import { body, noContent, preflight, requireUser, route } from '@/lib/api/http';
import { reportAnswer } from '@/lib/data/questions';

/** POST /api/v1/answers/:id/report { reason?: spam | offensive | off_topic | other } — report someone else's answer (again does nothing). */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const { reason } = await body(ctx.req);
  await reportAnswer(ctx.db, id, reason);
  return noContent();
});

export const OPTIONS = preflight;
