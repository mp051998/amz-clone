import { adminOnly } from '@/lib/api/admin';
import { json, preflight, route } from '@/lib/api/http';
import { getStoreReturn } from '@/lib/data/admin-returns';

/** GET /api/v1/admin/returns/:id — one return with its order, customer and refund. */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  await adminOnly(ctx);
  return json({ return: await getStoreReturn(ctx.db, ctx.market, id) });
});

export const OPTIONS = preflight;
