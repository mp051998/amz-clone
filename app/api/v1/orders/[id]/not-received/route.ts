import { json, preflight, requireUser, route } from '@/lib/api/http';
import { reportNotReceived } from '@/lib/data/not-received';

/**
 * POST /api/v1/orders/:id/not-received — "Package didn't arrive": the order was marked delivered
 * but never turned up. Refunds everything paid for it at once (card refunds on Stripe, see
 * `return.refund`) and answers `{return}`, a return with reason `not_received`. `409
 * return_not_allowed` before it's marked delivered (`detail` `not_delivered`), more than 30 days
 * after (`window_closed`), once anything from it has been returned or reported (`returned`), or
 * for cash on delivery, which is only paid when the package is (`cash_on_delivery`).
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  return json({ return: await reportNotReceived(ctx.db, id) }, { status: 201 });
});

export const OPTIONS = preflight;
