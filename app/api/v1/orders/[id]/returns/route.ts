import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { getOrderReturns, requestReturn } from '@/lib/data/returns';

/**
 * GET /api/v1/orders/:id/returns — the order's return window (`returnBy`, once delivered), what's
 * left to return per product (`returnable`) and its returns, newest first.
 */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const returns = await getOrderReturns(ctx.db, id);
  if (!returns) throw new DataError('order_not_found');
  return json(returns);
});

/**
 * POST /api/v1/orders/:id/returns `{ items: [{ productId, qty }], reason, comment? }` — start a
 * return (201). The refund is priced now: the items, their share of the tax and, when the store is
 * at fault (damaged, defective, wrong_item, missing_parts, not_as_described), of the delivery.
 * `return_not_allowed` (409, detail not_delivered | window_closed); `invalid_input` (detail
 * items | reason | comment).
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  const items = Array.isArray(b.items)
    ? b.items.map((it) => ({ productId: String((it as Record<string, unknown>)?.productId ?? ''), qty: Number((it as Record<string, unknown>)?.qty) }))
    : [];
  return json({ return: await requestReturn(ctx.db, id, { items, reason: b.reason, comment: b.comment }) }, { status: 201 });
});

export const OPTIONS = preflight;
