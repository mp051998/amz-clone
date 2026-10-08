import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { payCodOrder } from '@/lib/data/orders';

/**
 * POST /api/v1/orders/:id/pay-now {method, bank?} — pay a Pay on Delivery order (amazon.in) online
 * before it's delivered: `upi`, `netbanking` (optionally naming the bank) or `amazonpay` (from the
 * balance). The order then reads as paid that way (`prepaidAt` says when), and cancellations and
 * returns refund it. `invalid_input` (422) for another method, `order_not_payable` (409) when it
 * isn't an open Pay on Delivery order or has been delivered, `insufficient_balance` (409) when the
 * balance is short.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const { method, bank } = await body(ctx.req);
  return json({ order: await payCodOrder(ctx.db, id, method, bank) });
});

export const OPTIONS = preflight;
