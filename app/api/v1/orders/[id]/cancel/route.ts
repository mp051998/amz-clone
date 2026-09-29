import { json, preflight, requireUser, route } from '@/lib/api/http';
import { cancelPendingOrder } from '@/lib/data/orders';

/** POST /api/v1/orders/:id/cancel — abandon an unpaid card order; reserved stock is released. */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  return json({ order: await cancelPendingOrder(ctx.db, id) });
});

export const OPTIONS = preflight;
