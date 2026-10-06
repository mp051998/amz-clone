import { adminOnly } from '@/lib/api/admin';
import { json, preflight, route } from '@/lib/api/http';
import { assertStoreCase, closeCase } from '@/lib/data/support';

/** POST /api/v1/admin/support/:id/close — close one of this store's cases. */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  await adminOnly(ctx);
  await assertStoreCase(ctx.db, ctx.market, id);
  return json({ case: await closeCase(ctx.db, id) });
});

export const OPTIONS = preflight;
