import { noContent, preflight, requireUser, route } from '@/lib/api/http';
import { deleteQuestion } from '@/lib/data/questions';

/** DELETE /api/v1/questions/:id — delete your question (an admin, any) with its answers (`204`). */
export const DELETE = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  await deleteQuestion(ctx.db, id);
  return noContent();
});

export const OPTIONS = preflight;
