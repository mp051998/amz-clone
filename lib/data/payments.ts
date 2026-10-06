import 'server-only';
import type Stripe from 'stripe';
import { stripe } from '../stripe';
import { createAdminClient } from '../supabase/admin';
import type { Order } from '../types';
import { DataError, unwrap } from './errors';
import { toOrder } from './map';
import { refundOrder } from './refunds';

/**
 * Card payments run on Stripe hosted Checkout (the card is typed on Stripe, never
 * on our page). The order already exists in the database as `awaiting_payment`
 * with its stock reserved; Stripe is only asked to collect exactly the total the
 * database computed. Confirmation is a service-role write, so no customer request
 * can mark an order paid — only a session Stripe reports as paid can.
 */

type OrderRowJson = Parameters<typeof toOrder>[0];

export interface CheckoutUrls {
  /** absolute; Stripe appends nothing — we add `?session_id={CHECKOUT_SESSION_ID}` */
  successUrl: string;
  /** absolute; the order id is added so the cancel route can release the stock */
  cancelUrl: string;
}

/** Stripe needs an absolute https image: uploaded images already are; site paths get the origin. */
export function productImageUrl(image: string, origin?: string): string[] | undefined {
  if (image.startsWith('https://')) return [image];
  return origin?.startsWith('https://') ? [`${origin}${image}`] : undefined;
}

function requireStripe(): Stripe {
  if (!stripe) throw new DataError('payments_unavailable');
  return stripe;
}

/** Create the Stripe Checkout Session for an awaiting-payment card order; returns its URL. */
export async function startCardCheckout(order: Order, urls: CheckoutUrls, imageOrigin?: string): Promise<string> {
  const s = requireStripe();
  if (order.paymentMethod !== 'card' || order.status !== 'awaiting_payment') throw new DataError('order_not_pending');

  const currency = order.currency.toLowerCase();
  // a coupon comes off each unit, so the line is charged at the unit price after it
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = order.items.map((it) => ({
    quantity: it.qty,
    price_data: {
      currency,
      unit_amount: it.unitPriceMinor - (it.unitDiscountMinor ?? 0),
      product_data: {
        name: it.unitDiscountMinor ? `${it.title.slice(0, 104)} (coupon applied)` : it.title.slice(0, 120),
        // Stripe fetches images itself, so only offer publicly reachable ones.
        images: productImageUrl(it.image, imageOrigin),
      },
    },
  }));
  if (order.totals.shipMinor > 0) {
    lineItems.push({ quantity: 1, price_data: { currency, unit_amount: order.totals.shipMinor, product_data: { name: order.shipSpeed === 'fast' ? 'Faster delivery' : 'Shipping' } } });
  }
  if (order.totals.taxMinor > 0) {
    lineItems.push({ quantity: 1, price_data: { currency, unit_amount: order.totals.taxMinor, product_data: { name: 'Estimated tax' } } });
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await s.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      client_reference_id: order.id,
      metadata: { orderId: order.id, market: order.market },
      payment_intent_data: { metadata: { orderId: order.id } },
      success_url: `${urls.successUrl}${urls.successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${urls.cancelUrl}${urls.cancelUrl.includes('?') ? '&' : '?'}order=${encodeURIComponent(order.id)}`,
      // unpaid sessions lapse after an hour; the webhook then releases the stock
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    });
  } catch (err) {
    console.error('[stripe] checkout session create failed', err instanceof Error ? err.message : err);
    throw new DataError('payments_unavailable');
  }
  if (!session.url) throw new DataError('payments_unavailable');

  unwrap(await createAdminClient().rpc('attach_checkout_session', { p_order_id: order.id, p_session_id: session.id }));
  return session.url;
}

function brandLabel(brand?: string | null): string {
  switch (brand) {
    case 'visa': return 'Visa';
    case 'mastercard': return 'Mastercard';
    case 'amex': return 'Amex';
    case 'discover': return 'Discover';
    case 'rupay': return 'RuPay';
    default: return 'Card';
  }
}

function paymentLabel(session: Stripe.Checkout.Session): string {
  const pi = session.payment_intent;
  const charge = pi && typeof pi === 'object' ? pi.latest_charge : null;
  const card = charge && typeof charge === 'object' ? charge.payment_method_details?.card : null;
  return card?.last4 ? `${brandLabel(card.brand)} ending ${card.last4}` : brandLabel(card?.brand);
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  return typeof pi === 'string' ? pi : pi?.id ?? null;
}

/**
 * Mark the order paid from a session Stripe reports as paid. Idempotent.
 * Paid after its reserved stock was released and sold (`stock_released`): the order
 * stays cancelled and is refunded in full, then the error is passed on.
 */
export async function confirmSession(session: Stripe.Checkout.Session): Promise<Order> {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId) throw new DataError('order_not_found');
  if (session.payment_status !== 'paid') throw new DataError('payment_incomplete');
  const db = createAdminClient();
  const res = await db.rpc('confirm_order_payment', {
    p_order_id: orderId,
    p_session_id: session.id,
    p_amount_minor: session.amount_total ?? -1,
    p_currency: session.currency ?? '',
    p_payment_label: paymentLabel(session),
  });
  // Best effort: refunds can also find the PaymentIntent through the session.
  const pi = paymentIntentId(session);
  if (pi) await db.rpc('record_payment_intent', { p_order_id: orderId, p_payment_intent: pi });
  if (res.error?.message === 'stock_released') {
    const sold = await db.rpc('mark_sold_out', { p_order_id: orderId });
    if (sold.error) console.error('[stripe] mark_sold_out failed', orderId, sold.error.message);
    else await refundOrder(orderId, { db }).catch((err) => console.error('[stripe] sold-out refund failed', orderId, err));
  }
  return toOrder(unwrap(res) as unknown as OrderRowJson);
}

/** Return trip from Stripe: fetch the session server-side and confirm it. */
export async function confirmCheckoutSession(sessionId: string): Promise<Order> {
  const s = requireStripe();
  let session: Stripe.Checkout.Session;
  try {
    session = await s.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] });
  } catch (err) {
    console.error('[stripe] session retrieve failed', err instanceof Error ? err.message : err);
    throw new DataError('order_not_found');
  }
  return confirmSession(session);
}

/** Webhook: an unpaid session lapsed — release the order's reserved stock. */
export async function releaseSession(sessionId: string): Promise<string | null> {
  return unwrap(await createAdminClient().rpc('release_checkout_session', { p_session_id: sessionId }));
}
