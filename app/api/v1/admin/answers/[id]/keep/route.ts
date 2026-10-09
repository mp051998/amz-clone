import { adminOnly } from '@/lib/api/admin';
import { json, preflight, route } from '@/lib/api/http';
import { assertStoreAnswer, keepAnswer } from '@/lib/data/admin-questions';

/** POST /api/v1/admin/answers/:id/keep — keep an answer shoppers reported; its reports so far are resolved. */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  await adminOnly(ctx);
  await assertStoreAnswer(ctx.db, ctx.market, id);
  return json({ answer: await keepAnswer(ctx.db, id) });
});

export const OPTIONS = preflight;
