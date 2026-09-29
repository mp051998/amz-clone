import { json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { getOrder } from '@/lib/data/orders';

/** GET /api/v1/orders/:id — one of the caller's orders (any status). */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const order = await getOrder(ctx.db, id);
  if (!order) throw new DataError('order_not_found');
  return json({ order });
});

export const OPTIONS = preflight;
