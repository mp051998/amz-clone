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
 * POST /api/v1/orders { paymentMethod, emiMonths?, shipping: { fullName, phone, line1, line2?, landmark?, city, state, postcode, instructions? } | { fullName, phone, pickupPoint }, gift?: { message?, wrap? }, speed?: 'standard' | 'fast' | 'day' | 'no_rush', buyNow?: { productId, qty? }, promoCode?, bank?, gst?: { gstin, name } }
 * Checks out the caller's cart in this store (or, with `buyNow`, just that product, leaving the cart as it is). The database reserves stock and
 * computes every total. Non-card orders come back `placed`; card orders come
 * back `awaiting_payment` with a Stripe `checkoutUrl` to send the customer to. India only: `gst`
 * makes the invoice out to that GSTIN and business name (`invalid_input` gstin | gstName before
 * anything is reserved; `gst_unavailable` in other stores). `shipping.pickupPoint` (an id from
 * `GET /pickup-points`) collects the order there with a pickup code instead. Net banking and EMI:
 * `bank` names the shopper's bank, and its best Bank Offer (`GET /bank-offers`) comes off the items.
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  if (!isPaymentMethod(b.paymentMethod)) throw new DataError('payment_method_unavailable');
  const shipping = (b.shipping && typeof b.shipping === 'object' ? b.shipping : {}) as AddressFieldsInput & { pickupPoint?: unknown };
  const pickupPoint = shipping.pickupPoint;
  if (pickupPoint !== undefined && pickupPoint !== null && (typeof pickupPoint !== 'string' || !pickupPoint.trim())) {
    throw new DataError('pickup_point_not_found');
  }
  const g = b.gift && typeof b.gift === 'object' ? (b.gift as { message?: unknown; wrap?: unknown }) : null;
  const gift = g ? { message: g.message, wrap: g.wrap === true } : b.gift === true ? {} : undefined;
  if (b.speed !== undefined && !isShipSpeed(b.speed)) throw new DataError('delivery_option_unavailable');
  let buyNow: BuyNow | undefined;
  if (b.buyNow !== undefined) {
    const raw = (b.buyNow && typeof b.buyNow === 'object' ? b.buyNow : {}) as { productId?: unknown; qty?: unknown; protection?: unknown; size?: unknown };
    buyNow = readBuyNow(raw.productId, raw.qty ?? 1, raw.protection === true, raw.size) ?? undefined;
    if (!buyNow) throw new DataError('invalid_input', 'buyNow.productId', 'Say which product to buy.');
  }

  if (b.promoCode !== undefined && b.promoCode !== null && typeof b.promoCode !== 'string') {
    throw new DataError('invalid_input', 'promoCode', 'Enter a promotion code.');
  }
  if (b.bank !== undefined && b.bank !== null && typeof b.bank !== 'string') {
    throw new DataError('invalid_input', 'bank', 'Choose your bank from the list.');
  }

  const gr = b.gst && typeof b.gst === 'object' ? (b.gst as { gstin?: unknown; name?: unknown }) : null;
  if (b.gst !== undefined && b.gst !== null && !gr) throw new DataError('invalid_input', 'gstin', 'Send gst as { gstin, name }.');

  const emiMonths = b.emiMonths === undefined ? undefined : Number(b.emiMonths);
  const order = await placeOrder(ctx.db, ctx.market, {
    paymentMethod: b.paymentMethod,
    shipping,
    pickupPoint: typeof pickupPoint === 'string' ? pickupPoint.trim() : undefined,
    gift,
    speed: isShipSpeed(b.speed) ? b.speed : undefined,
    buyNow,
    emiMonths,
    promoCode: typeof b.promoCode === 'string' ? b.promoCode : null,
    bank: b.bank,
    gst: gr ? { gstin: gr.gstin, name: gr.name } : undefined,
  });
  if (order.status === 'placed') return json({ order }, { status: 201 });

  const origin = ctx.req.nextUrl.origin;
  const sp = (path: string) => `${origin}${storePath({ id: ctx.market }, path)}`;
  try {
    const cancelUrl = sp(buyNow ? `/checkout/cancel?${buyNowQuery(buyNow)}` : '/checkout/cancel');
    const checkoutUrl = await startCardCheckout(order, { successUrl: sp('/checkout/success'), cancelUrl }, origin, ctx.user);
    return json({ order, checkoutUrl }, { status: 201 });
  } catch (err) {
    await cancelPendingOrder(ctx.db, order.id).catch(() => undefined);
    throw err;
  }
});

export const OPTIONS = preflight;
