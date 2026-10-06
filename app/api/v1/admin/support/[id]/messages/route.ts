import { adminOnly } from '@/lib/api/admin';
import { body, json, preflight, route } from '@/lib/api/http';
import { assertStoreCase, replyToCase } from '@/lib/data/support';

/** POST /api/v1/admin/support/:id/messages { body } — answer a case as the store; it moves to answered. `201 {message}`. */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  await adminOnly(ctx);
  await assertStoreCase(ctx.db, ctx.market, id);
  const b = await body(ctx.req);
  return json({ message: await replyToCase(ctx.db, id, b.body) }, { status: 201 });
});

export const OPTIONS = preflight;
