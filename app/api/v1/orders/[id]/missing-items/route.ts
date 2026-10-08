import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { reportMissingItems } from '@/lib/data/missing-items';

/**
 * POST /api/v1/orders/:id/missing-items { items: [{productId, qty}], resolution?, refundTo?, comment? }
 * — "Item missing from package": items that weren't in a delivered order's package. As a return
 * (the same windows, quantities left and replacement-only rules, `refundTo` and errors), except
 * nothing is sent back: answers `201 {return}`, a received return with reason `missing_item`,
 * refunded at once (card refunds on Stripe, see `return.refund`) with the items' share of tax and
 * delivery, or with `resolution: 'replacement'` the items sent again at no charge
 * (`return.replacement`).
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const input = await body(ctx.req);
  return json(
    { return: await reportMissingItems(ctx.db, id, { items: input.items, resolution: input.resolution, refundTo: input.refundTo, comment: input.comment }) },
    { status: 201 },
  );
});

export const OPTIONS = preflight;
