import { json, preflight, requireUser, route } from '@/lib/api/http';
import { cancelOrder } from '@/lib/data/orders';

/**
 * POST /api/v1/orders/:id/cancel — cancel an unpaid checkout (reserved stock released) or a
 * placed order that hasn't shipped (stock returned; card payments refunded on Stripe, see
 * `order.refund`). `order_not_cancellable` (409) once it has shipped.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  return json({ order: await cancelOrder(ctx.db, id) });
});

export const OPTIONS = preflight;
