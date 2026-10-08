import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { getOrderReturns, requestReturn } from '@/lib/data/returns';

/**
 * GET /api/v1/orders/:id/returns — the order's return window (`returnBy`, once delivered), each
 * product's (`returnByItem`: a replacement's runs from its own delivery), what can be returned now
 * per product (`returnable`), what can be replaced instead (`replaceable`) and its returns, newest
 * first.
 */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const returns = await getOrderReturns(ctx.db, id);
  if (!returns) throw new DataError('order_not_found');
  return json(returns);
});

/**
 * POST /api/v1/orders/:id/returns `{ items: [{ productId, qty, size? }], reason, comment?, resolution?, refundTo? }` —
 * start a return (201). `resolution` 'refund' (default): priced now, the items, their share of the
 * tax and, when the store is at fault (damaged, defective, wrong_item, missing_parts,
 * not_as_described), of the delivery. 'replacement' (store-fault reasons): the same items ship
 * now at no charge; for too_small / too_large it's an exchange, each item with the `size` (one it
 * comes in, not the one ordered) to send instead. `refundTo` 'original' (default) refunds how the order was paid; 'balance' pays
 * the refund onto the caller's balance in the store as soon as the items are received (ignored for
 * a replacement or an order paid from the balance; refused for a Pay Later order, whose refunds go
 * back to Pay Later). `return_not_allowed` (409, detail
 * not_delivered | window_closed); `replacement_unavailable` (409, detail already_replaced |
 * out_of_stock); `invalid_input` (detail items | reason | comment | resolution | refundTo | size).
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  const items = Array.isArray(b.items)
    ? b.items.map((it) => {
        const x = it as Record<string, unknown>;
        return { productId: String(x?.productId ?? ''), qty: Number(x?.qty), ...(typeof x?.size === 'string' ? { size: x.size } : {}) };
      })
    : [];
  return json({ return: await requestReturn(ctx.db, id, { items, reason: b.reason, comment: b.comment, resolution: b.resolution, refundTo: b.refundTo }) }, { status: 201 });
});

export const OPTIONS = preflight;
