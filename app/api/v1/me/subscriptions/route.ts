import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { listSubscriptions, subscribe, subscribeMethods } from '@/lib/data/subscriptions';
import { intField, stringField } from './fields';

/**
 * GET /api/v1/me/subscriptions?all=1 — the caller's Subscribe & Save subscriptions in this store,
 * newest first (active ones; with `all=1` the cancelled too), and `methods`, how this store takes
 * payment for deliveries.
 */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  const includeCancelled = ctx.req.nextUrl.searchParams.get('all') === '1';
  const [subscriptions, methods] = await Promise.all([listSubscriptions(ctx.db, ctx.market, { includeCancelled }), subscribeMethods(ctx.db, ctx.market)]);
  return json({ subscriptions, methods });
});

/**
 * POST /api/v1/me/subscriptions { productId, qty, everyMonths, addressId, paymentMethod } —
 * subscribe and place the first delivery now: `201 {subscription, order}`. Refusals:
 * `404 product_not_found` / `address_not_found`, `409 subscribe_unavailable` /
 * `already_subscribed` / `insufficient_stock` / `insufficient_balance`,
 * `422 payment_method_unavailable` / `invalid_input` (`detail`: the field).
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  const qty = intField(b, 'qty');
  const everyMonths = intField(b, 'everyMonths');
  if (qty == null) throw new DataError('invalid_input', 'qty');
  if (everyMonths == null) throw new DataError('invalid_input', 'everyMonths');
  const r = await subscribe(ctx.db, {
    market: ctx.market,
    productId: stringField(b, 'productId', true)!,
    qty,
    everyMonths,
    addressId: stringField(b, 'addressId', true)!,
    paymentMethod: stringField(b, 'paymentMethod', true)!,
  });
  return json(r, { status: 201 });
});

export const OPTIONS = preflight;
