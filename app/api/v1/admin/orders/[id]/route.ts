import { adminOnly } from '@/lib/api/admin';
import { json, preflight, route } from '@/lib/api/http';
import { getStoreOrder } from '@/lib/data/admin-orders';

/** GET /api/v1/admin/orders/:id — the order with its stage, customer and refund details. */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  await adminOnly(ctx);
  return json({ order: await getStoreOrder(ctx.db, ctx.market, id) });
});

export const OPTIONS = preflight;
