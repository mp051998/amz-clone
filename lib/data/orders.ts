import type { Db } from '../db/client';
import type { Market, Order, PaymentMethod, ShipSpeed } from '../types';
import { parseAddress, type AddressFieldsInput } from './addresses';
import { DataError, unwrap } from './errors';
import { toOrder } from './map';
import { expireCardCheckout } from './payments';
import { refundOrder } from './refunds';

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['card', 'giftcard', 'upi', 'netbanking', 'cod', 'emi', 'amazonpay'];

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === 'string' && (PAYMENT_METHODS as readonly string[]).includes(v);
}

export const GIFT_NOTE_MAX = 240;

export interface PlaceOrderInput {
  paymentMethod: PaymentMethod;
  shipping: AddressFieldsInput;
  /** mark the order as a gift, with an optional note for the recipient */
  gift?: { message?: unknown };
  /** delivery speed; 'fast' only when offered right now (see deliveryOptions) */
  speed?: ShipSpeed;
}

export function isShipSpeed(v: unknown): v is ShipSpeed {
  return v === 'standard' || v === 'fast';
}

/** A gift note as typed: trimmed, blank is none. Longer than GIFT_NOTE_MAX is refused (invalid_input). */
export function readGiftNote(v: unknown): string | undefined {
  const note = typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : '';
  if (note.length > GIFT_NOTE_MAX) {
    throw new DataError('invalid_input', 'gift.message', `Gift messages can be up to ${GIFT_NOTE_MAX} characters.`);
  }
  return note || undefined;
}

/**
 * Turn the caller's cart into an order (place_order RPC): stock is locked and
 * reserved, every line priced from the catalog, totals computed by the DB.
 * Card orders come back `awaiting_payment` — hand them to startCardCheckout.
 */
export async function placeOrder(db: Db, market: Market, input: PlaceOrderInput): Promise<Order> {
  const a = parseAddress(market, input.shipping);
  const note = input.gift ? readGiftNote(input.gift.message) : undefined;
  const json = unwrap(
    await db.rpc('place_order', {
      p_market: market,
      p_payment_method: input.paymentMethod,
      p_shipping: {
        full_name: a.fullName,
        phone: a.phone,
        line1: a.line1,
        line2: a.line2 ?? null,
        landmark: a.schema === 'IN' ? a.landmark ?? null : null,
        city: a.city,
        state: a.state,
        postcode: a.postcode,
      },
      // sent only for gifts, so ordinary checkouts don't depend on the gift migration
      ...(input.gift ? { p_gift: true, ...(note ? { p_gift_message: note } : {}) } : {}),
      // likewise only for fast delivery
      ...(input.speed === 'fast' ? { p_speed: 'fast' } : {}),
    }),
  );
  return toOrder(json as unknown as Parameters<typeof toOrder>[0]);
}

/** The store's fee for faster delivery (minor units); null until the delivery-speed migration lands. */
export async function fastShipFee(db: Db, market: Market): Promise<number | null> {
  const { data, error } = await db.from('markets').select('fast_ship_fee_minor').eq('id', market).maybeSingle();
  return error || !data ? null : data.fast_ship_fee_minor;
}

const ORDER_SELECT = '*, order_items(*)';

// Orders that were placed or charged: placed ones (cancelled later or not) and card
// payments that arrived after their stock sold out. Abandoned checkouts are left out.
const PLACED_OR_CHARGED = 'placed_at.not.is.null,refund_status.not.is.null';
// Postgres "undefined column": refund_status is missing until the lifecycle migration lands.
const MISSING_COLUMN = '42703';

/** The caller's placed or charged orders in a store (cancelled ones included), newest first. */
export async function listOrders(db: Db, market: Market, opts: { limit?: number } = {}): Promise<Order[]> {
  const query = (placedOnly: boolean) => {
    let q = db.from('orders').select(ORDER_SELECT).eq('market_id', market);
    q = placedOnly ? q.not('placed_at', 'is', null) : q.or(PLACED_OR_CHARGED);
    q = q.order('created_at', { ascending: false });
    return opts.limit ? q.limit(opts.limit) : q;
  };
  let res = await query(false);
  if (res.error?.code === MISSING_COLUMN) res = await query(true);
  return unwrap(res).map((row) => toOrder(row));
}

export async function countOrders(db: Db, market: Market): Promise<number> {
  const query = (placedOnly: boolean) => {
    const q = db.from('orders').select('id', { count: 'exact', head: true }).eq('market_id', market);
    return placedOnly ? q.not('placed_at', 'is', null) : q.or(PLACED_OR_CHARGED);
  };
  let res = await query(false);
  if (res.error?.code === MISSING_COLUMN) res = await query(true);
  unwrap(res);
  return res.count ?? 0;
}

/** One of the caller's orders (any status). RLS hides everyone else's. */
export async function getOrder(db: Db, id: string): Promise<Order | null> {
  const row = unwrap(await db.from('orders').select(ORDER_SELECT).eq('id', id).maybeSingle());
  return row ? toOrder(row) : null;
}

/** Owner abandons an unpaid card checkout: order cancelled, reserved stock released. */
export async function cancelPendingOrder(db: Db, id: string): Promise<Order> {
  const json = unwrap(await db.rpc('cancel_pending_order', { p_order_id: id }));
  if (!json) throw new DataError('order_not_found');
  return toOrder(json as unknown as Parameters<typeof toOrder>[0]);
}

/**
 * Owner cancels an order: an unpaid checkout (stock released, as cancelPendingOrder, and its
 * Stripe page closed), or a placed order that hasn't shipped yet — stock returned, and a card payment
 * refunded on Stripe. The cancel stands even if the refund fails (admins retry it).
 */
export async function cancelOrder(db: Db, id: string): Promise<Order> {
  const res = await db.rpc('cancel_my_order', { p_order_id: id });
  // PGRST202: the RPC doesn't exist yet (lifecycle migration not applied)
  if (res.error?.code === 'PGRST202') return cancelPendingOrder(db, id);
  const json = unwrap(res);
  if (!json) throw new DataError('order_not_found');
  const order = toOrder(json as unknown as Parameters<typeof toOrder>[0]);
  // an unpaid card order: close its Stripe page so it can't be paid now it's cancelled
  if (order.paymentMethod === 'card' && !order.refund) await expireCardCheckout(id);
  if (order.paymentMethod !== 'card' || order.refund?.status !== 'pending') return order;
  try {
    await refundOrder(id);
  } catch (err) {
    console.error('[orders] refund after cancel failed', id, err);
  }
  return (await getOrder(db, id)) ?? order;
}
