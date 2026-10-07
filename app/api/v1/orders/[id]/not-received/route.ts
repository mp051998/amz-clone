import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { reportNotReceived } from '@/lib/data/not-received';

/**
 * POST /api/v1/orders/:id/not-received — "Package didn't arrive": the order was marked delivered
 * but never turned up. Body (optional) `{resolution}`: `refund` (the default) gives back
 * everything paid for it at once (card refunds on Stripe, see `return.refund`); `replacement`
 * sends every item again at no charge (`return.replacement`), or `409 replacement_unavailable`
 * (`out_of_stock`) when any of it is sold out or no longer on sale. Answers `{return}`, a return
 * with reason `not_received`. `409 return_not_allowed` before it's marked delivered (`detail`
 * `not_delivered`), more than 30 days after (`window_closed`), once anything from it has been
 * returned or reported (`returned`), or for cash on delivery, which is only paid when the package
 * is (`cash_on_delivery`).
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const input = await body(ctx.req);
  return json({ return: await reportNotReceived(ctx.db, id, input.resolution) }, { status: 201 });
});

export const OPTIONS = preflight;
