import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { cancelOrderItems } from '@/lib/data/orders';

/**
 * POST /api/v1/orders/:id/cancel-items {productIds} — cancel some items of a placed order that
 * hasn't shipped, each line whole; the rest keep coming, repriced. The cancelled items' refund is
 * in `order.cancellations` (card payments refunded on Stripe). Every item cancels the order.
 * `invalid_input` (422) for none or one that isn't in the order, `order_not_cancellable` (409)
 * once it has shipped.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const { productIds } = await body(ctx.req);
  return json({ order: await cancelOrderItems(ctx.db, id, productIds) });
});

export const OPTIONS = preflight;
