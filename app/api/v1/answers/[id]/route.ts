import { noContent, preflight, requireUser, route } from '@/lib/api/http';
import { deleteAnswer } from '@/lib/data/questions';

/** DELETE /api/v1/answers/:id — delete your answer (an admin, any) (`204`). */
export const DELETE = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  await deleteAnswer(ctx.db, id);
  return noContent();
});

export const OPTIONS = preflight;
