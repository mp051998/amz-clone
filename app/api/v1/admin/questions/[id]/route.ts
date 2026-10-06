import { adminOnly } from '@/lib/api/admin';
import { json, preflight, route } from '@/lib/api/http';
import { assertStoreQuestion } from '@/lib/data/admin-questions';
import { deleteQuestion } from '@/lib/data/questions';

/** DELETE /api/v1/admin/questions/:id — remove a question about this store's product, with its answers. */
export const DELETE = route<{ id: string }>(async (ctx, { id }) => {
  await adminOnly(ctx);
  await assertStoreQuestion(ctx.db, ctx.market, id);
  await deleteQuestion(ctx.db, id);
  return json({ question: { id, deleted: true } });
});

export const OPTIONS = preflight;
