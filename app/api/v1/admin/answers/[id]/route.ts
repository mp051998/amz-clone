import { adminOnly } from '@/lib/api/admin';
import { json, preflight, route } from '@/lib/api/http';
import { assertStoreAnswer } from '@/lib/data/admin-questions';
import { deleteAnswer } from '@/lib/data/questions';

/** DELETE /api/v1/admin/answers/:id — remove an answer on a question about this store's product. */
export const DELETE = route<{ id: string }>(async (ctx, { id }) => {
  await adminOnly(ctx);
  await assertStoreAnswer(ctx.db, ctx.market, id);
  await deleteAnswer(ctx.db, id);
  return json({ answer: { id, deleted: true } });
});

export const OPTIONS = preflight;
