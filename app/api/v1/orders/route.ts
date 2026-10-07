import { body, intParam, json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { cancelPendingOrder, isPaymentMethod, isShipSpeed, listOrders, placeOrder } from '@/lib/data/orders';
import { startCardCheckout } from '@/lib/data/payments';
import { storePath } from '@/lib/marketplace';
import type { AddressFieldsInput } from '@/lib/data/addresses';
import { buyNowQuery, readBuyNow, type BuyNow } from '@/lib/buy-now';

/** GET /api/v1/orders?market=US&limit=50 — the caller's placed orders, newest first. */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  const limit = intParam(ctx.req.nextUrl.searchParams.get('limit'), 50, 1, 100);
  return json({ orders: await listOrders(ctx.db, ctx.market, { limit }) });
});

/**
 * POST /api/v1/orders { paymentMethod, emiMonths?, shipping: { fullName, phone, line1, line2?, landmark?, city, state, postcode, instructions? }, gift?: { message?, wrap? }, speed?: 'standard' | 'fast', buyNow?: { productId, qty? }, promoCode? }
 * Checks out the caller's cart in this store (or, with `buyNow`, just that product, leaving the cart as it is). The database reserves stock and
 * computes every total. Non-card orders come back `placed`; card orders come
 * back `awaiting_payment` with a Stripe `checkoutUrl` to send the customer to.
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  if (!isPaymentMethod(b.paymentMethod)) throw new DataError('payment_method_unavailable');
  const shipping = (b.shipping && typeof b.shipping === 'object' ? b.shipping : {}) as AddressFieldsInput;
  const g = b.gift && typeof b.gift === 'object' ? (b.gift as { message?: unknown; wrap?: unknown }) : null;
  const gift = g ? { message: g.message, wrap: g.wrap === true } : b.gift === true ? {} : undefined;
  if (b.speed !== undefined && !isShipSpeed(b.speed)) throw new DataError('delivery_option_unavailable');
  let buyNow: BuyNow | undefined;
  if (b.buyNow !== undefined) {
    const raw = (b.buyNow && typeof b.buyNow === 'object' ? b.buyNow : {}) as { productId?: unknown; qty?: unknown; protection?: unknown };
    buyNow = readBuyNow(raw.productId, raw.qty ?? 1, raw.protection === true) ?? undefined;
    if (!buyNow) throw new DataError('invalid_input', 'buyNow.productId', 'Say which product to buy.');
  }

  if (b.promoCode !== undefined && b.promoCode !== null && typeof b.promoCode !== 'string') {
    throw new DataError('invalid_input', 'promoCode', 'Enter a promotion code.');
  }

  const emiMonths = b.emiMonths === undefined ? undefined : Number(b.emiMonths);
  const order = await placeOrder(ctx.db, ctx.market, {
    paymentMethod: b.paymentMethod,
    shipping,
    gift,
    speed: isShipSpeed(b.speed) ? b.speed : undefined,
    buyNow,
    emiMonths,
    promoCode: typeof b.promoCode === 'string' ? b.promoCode : null,
  });
  if (order.status === 'placed') return json({ order }, { status: 201 });

  const origin = ctx.req.nextUrl.origin;
  const sp = (path: string) => `${origin}${storePath({ id: ctx.market }, path)}`;
  try {
    const cancelUrl = sp(buyNow ? `/checkout/cancel?${buyNowQuery(buyNow)}` : '/checkout/cancel');
    const checkoutUrl = await startCardCheckout(order, { successUrl: sp('/checkout/success'), cancelUrl }, origin);
    return json({ order, checkoutUrl }, { status: 201 });
  } catch (err) {
    await cancelPendingOrder(ctx.db, order.id).catch(() => undefined);
    throw err;
  }
});

export const OPTIONS = preflight;
