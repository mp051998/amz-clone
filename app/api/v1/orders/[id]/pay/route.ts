import { json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { getOrder } from '@/lib/data/orders';
import { resumeCardCheckout } from '@/lib/data/payments';
import { storePath } from '@/lib/marketplace';

/**
 * POST /api/v1/orders/:id/pay — finish paying an unpaid card order. `{checkoutUrl}`: its Stripe
 * page (the same one while it's still open, else a new one); `{order}` when Stripe says it was
 * paid after all. `409 order_not_pending` for any other order.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const order = await getOrder(ctx.db, id);
  if (!order) throw new DataError('order_not_found');
  const origin = ctx.req.nextUrl.origin;
  const sp = (path: string) => `${origin}${storePath({ id: order.market }, path)}`;
  const checkoutUrl = await resumeCardCheckout(order, { successUrl: sp('/checkout/success'), cancelUrl: sp('/checkout/cancel') }, origin, ctx.user);
  return checkoutUrl ? json({ checkoutUrl }) : json({ order: await getOrder(ctx.db, id) });
});

export const OPTIONS = preflight;
