import { adminOnly } from '@/lib/api/admin';
import { json, preflight, route } from '@/lib/api/http';
import { getStoreOrder } from '@/lib/data/admin-orders';
import { listOrderReturns } from '@/lib/data/admin-returns';

/** GET /api/v1/admin/orders/:id — the order with its stage, customer and refund details, and its returns. */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  await adminOnly(ctx);
  const order = await getStoreOrder(ctx.db, ctx.market, id);
  return json({ order, returns: await listOrderReturns(ctx.db, order.id) });
});

export const OPTIONS = preflight;
