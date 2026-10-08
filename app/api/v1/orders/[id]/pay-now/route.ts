import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { getOrder, payCodOrder } from '@/lib/data/orders';
import { startPayNowCheckout } from '@/lib/data/payments';
import { storePath } from '@/lib/marketplace';

/**
 * POST /api/v1/orders/:id/pay-now {method, bank?} — pay a Pay on Delivery order (amazon.in) online
 * before it's delivered: `upi`, `netbanking` (optionally naming the bank) or `amazonpay` (from the
 * balance) at once, `{order}`; or `card`, `{checkoutUrl}` (its Stripe page, the same one while it's
 * open; `{order}` when Stripe says it was paid after all), the order switching once Stripe says it's
 * paid. The order then reads as paid that way (`prepaidAt` says when), and cancellations and
 * returns refund it. `invalid_input` (422) for another method, `order_not_payable` (409) when it
 * isn't an open Pay on Delivery order or has been delivered, `insufficient_balance` (409) when the
 * balance is short.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const { method, bank } = await body(ctx.req);
  if (method !== 'card') return json({ order: await payCodOrder(ctx.db, id, method, bank) });
  const order = await getOrder(ctx.db, id);
  if (!order) throw new DataError('order_not_found');
  const origin = ctx.req.nextUrl.origin;
  const page = `${origin}${storePath({ id: order.market }, `/orders/${encodeURIComponent(order.id)}`)}`;
  const checkoutUrl = await startPayNowCheckout(order, { successUrl: `${page}/paid`, cancelUrl: `${page}?placed=0#pay-now` }, ctx.user);
  return checkoutUrl ? json({ checkoutUrl }) : json({ order: await getOrder(ctx.db, id) });
});

export const OPTIONS = preflight;
