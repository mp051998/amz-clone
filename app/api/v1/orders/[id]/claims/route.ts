import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { fileClaim, orderClaims } from '@/lib/data/atoz-claims';
import { DataError } from '@/lib/data/errors';
import { getOrder } from '@/lib/data/orders';

/**
 * GET /api/v1/orders/:id/claims — the A-to-z Guarantee claims filed about the order, oldest first.
 * `404 order_not_found` for someone else's order.
 */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  if (!(await getOrder(ctx.db, id))) throw new DataError('order_not_found');
  return json({ claims: await orderClaims(ctx.db, id) });
});

/**
 * POST /api/v1/orders/:id/claims `{ seller, reason, details }` — file an A-to-z Guarantee claim
 * about one seller's items in the order (201 `{claim}`, under review). `reason` is
 * `not_received` or `not_as_described`; `details` says what happened (10–2,000 characters).
 * `409 claim_not_allowed` with `detail` `sold_by_amazon` (the store sells it itself),
 * `not_delivered`, `window_closed` (over 90 days since delivery), `cash_on_delivery` (not_received
 * on an order paid on delivery), `already_claimed`, `contact_seller_first` (no case with the seller
 * about the order), `wait_for_seller` (the seller was contacted less than 2 days ago) or
 * `nothing_left` (all of it returned or refunded). `422 invalid_input` (`seller` | `reason` |
 * `details`); `404 order_not_found` for someone else's order.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  return json({ claim: await fileClaim(ctx.db, id, { seller: b.seller, reason: b.reason, details: b.details }) }, { status: 201 });
});

export const OPTIONS = preflight;
