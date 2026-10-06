import { body, intParam, json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { cancelPendingOrder, isPaymentMethod, isShipSpeed, listOrders, placeOrder } from '@/lib/data/orders';
import { startCardCheckout } from '@/lib/data/payments';
import { storePath } from '@/lib/marketplace';
import type { AddressFieldsInput } from '@/lib/data/addresses';

/** GET /api/v1/orders?market=US&limit=50 — the caller's placed orders, newest first. */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  const limit = intParam(ctx.req.nextUrl.searchParams.get('limit'), 50, 1, 100);
  return json({ orders: await listOrders(ctx.db, ctx.market, { limit }) });
});

/**
 * POST /api/v1/orders { paymentMethod, shipping: { fullName, phone, line1, line2?, landmark?, city, state, postcode }, gift?: { message? }, speed?: 'standard' | 'fast' }
 * Checks out the caller's cart in this store. The database reserves stock and
 * computes every total. Non-card orders come back `placed`; card orders come
 * back `awaiting_payment` with a Stripe `checkoutUrl` to send the customer to.
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  if (!isPaymentMethod(b.paymentMethod)) throw new DataError('payment_method_unavailable');
  const shipping = (b.shipping && typeof b.shipping === 'object' ? b.shipping : {}) as AddressFieldsInput;
  const gift = b.gift && typeof b.gift === 'object' ? { message: (b.gift as { message?: unknown }).message } : b.gift === true ? {} : undefined;
  if (b.speed !== undefined && !isShipSpeed(b.speed)) throw new DataError('delivery_option_unavailable');

  const order = await placeOrder(ctx.db, ctx.market, { paymentMethod: b.paymentMethod, shipping, gift, speed: isShipSpeed(b.speed) ? b.speed : undefined });
  if (order.status === 'placed') return json({ order }, { status: 201 });

  const origin = ctx.req.nextUrl.origin;
  const sp = (path: string) => `${origin}${storePath({ id: ctx.market }, path)}`;
  try {
    const checkoutUrl = await startCardCheckout(order, { successUrl: sp('/checkout/success'), cancelUrl: sp('/checkout/cancel') }, origin);
    return json({ order, checkoutUrl }, { status: 201 });
  } catch (err) {
    await cancelPendingOrder(ctx.db, order.id).catch(() => undefined);
    throw err;
  }
});

export const OPTIONS = preflight;
