import type { Db } from '../db/client';
import type { Market, Order, PaymentMethod, ShipSpeed } from '../types';
import type { BuyNow } from '../buy-now';
import { INSTRUCTIONS_MAX } from '../contracts';
import { parseAddress, type AddressFieldsInput } from './addresses';
import { DataError, unwrap } from './errors';
import { toOrder } from './map';
import { expireCardCheckout } from './payments';
import { refundCancellation, refundOrder } from './refunds';

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['card', 'giftcard', 'upi', 'netbanking', 'cod', 'emi', 'amazonpay'];

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === 'string' && (PAYMENT_METHODS as readonly string[]).includes(v);
}

export const GIFT_NOTE_MAX = 240;

export interface PlaceOrderInput {
  paymentMethod: PaymentMethod;
  shipping: AddressFieldsInput;
  /** mark the order as a gift, with an optional note for the recipient */
  gift?: { message?: unknown; wrap?: boolean };
  /** delivery speed; 'fast' only when offered right now (see deliveryOptions) */
  speed?: ShipSpeed;
  /** Buy Now: order just this product (the cart is left as it is) */
  buyNow?: BuyNow;
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
 * Turn the caller's cart (or, for Buy Now, the one product) into an order (place_order RPC):
 * stock is locked and reserved, every line priced from the catalog, totals computed by the DB.
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
        instructions: a.instructions ?? null,
      },
      // sent only for gifts, so ordinary checkouts don't depend on the gift migration
      ...(input.gift ? { p_gift: true, ...(note ? { p_gift_message: note } : {}), ...(input.gift.wrap ? { p_gift_wrap: true } : {}) } : {}),
      // likewise only for fast delivery
      ...(input.speed === 'fast' ? { p_speed: 'fast' } : {}),
      ...(input.buyNow ? { p_buy: { product_id: input.buyNow.productId, qty: input.buyNow.qty } } : {}),
    }),
  );
  return toOrder(json as unknown as Parameters<typeof toOrder>[0]);
}

/** The store's gift wrap fee per item (minor units); null when it doesn't wrap, or until the gift wrap migration lands. */
export async function giftWrapFee(db: Db, market: Market): Promise<number | null> {
  const { data, error } = await db.from('markets').select('gift_wrap_minor').eq('id', market).maybeSingle();
  return error || !data ? null : data.gift_wrap_minor;
}

/** The store's fee for faster delivery (minor units); null until the delivery-speed migration lands. */
export async function fastShipFee(db: Db, market: Market): Promise<number | null> {
  const { data, error } = await db.from('markets').select('fast_ship_fee_minor').eq('id', market).maybeSingle();
  return error || !data ? null : data.fast_ship_fee_minor;
}

const ORDER_SELECT = '*, order_items(*), order_cancellations(*, order_cancelled_items(*))';
// PGRST200: order_cancellations is missing until the cancel-items migration lands.
const ORDER_SELECT_BEFORE_CANCELLATIONS = '*, order_items(*)';
const MISSING_EMBED = 'PGRST200';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Orders that were placed or charged: placed ones (cancelled later or not) and card
// payments that arrived after their stock sold out. Abandoned checkouts are left out.
const PLACED_OR_CHARGED = 'placed_at.not.is.null,refund_status.not.is.null';
// Postgres "undefined column": refund_status is missing until the lifecycle migration lands.
const MISSING_COLUMN = '42703';

/** The caller's placed or charged orders in a store (cancelled ones included), newest first. */
export async function listOrders(db: Db, market: Market, opts: { limit?: number } = {}): Promise<Order[]> {
  let select = ORDER_SELECT;
  const query = (placedOnly: boolean) => {
    let q = db.from('orders').select(select).eq('market_id', market);
    q = placedOnly ? q.not('placed_at', 'is', null) : q.or(PLACED_OR_CHARGED);
    q = q.order('created_at', { ascending: false });
    return opts.limit ? q.limit(opts.limit) : q;
  };
  let res = await query(false);
  if (res.error?.code === MISSING_EMBED) {
    select = ORDER_SELECT_BEFORE_CANCELLATIONS;
    res = await query(false);
  }
  if (res.error?.code === MISSING_COLUMN) res = await query(true);
  return unwrap(res).map((row) => toOrder(row as unknown as Parameters<typeof toOrder>[0]));
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
  const query = (select: string) => db.from('orders').select(select).eq('id', id).maybeSingle();
  let res = await query(ORDER_SELECT);
  if (res.error?.code === MISSING_EMBED) res = await query(ORDER_SELECT_BEFORE_CANCELLATIONS);
  const row = unwrap(res);
  return row ? toOrder(row as unknown as Parameters<typeof toOrder>[0]) : null;
}

/**
 * Owner changes an order's delivery instructions (blank clears them) until it's out for delivery
 * (`order_not_editable` after). The saved address keeps its own note.
 */
export async function setOrderInstructions(db: Db, id: string, raw: unknown): Promise<Order> {
  const text = typeof raw === 'string' ? raw.replace(/\r\n?/g, '\n').trim() : '';
  if (text.length > INSTRUCTIONS_MAX) {
    throw new DataError('invalid_input', 'instructions', `Keep delivery instructions under ${INSTRUCTIONS_MAX} characters.`);
  }
  const json = unwrap(await db.rpc('set_my_order_instructions', { p_order_id: id, p_instructions: text }));
  if (!json) throw new DataError('order_not_found');
  return toOrder(json as unknown as Parameters<typeof toOrder>[0]);
}

/**
 * Owner sends an order to another address in their address book for the same store, while it's
 * being prepared (`order_address_locked` once it ships). The order takes that address's delivery
 * instructions too; totals don't change.
 */
export async function setOrderAddress(db: Db, id: string, addressId: unknown): Promise<Order> {
  if (typeof addressId !== 'string' || !UUID.test(addressId)) throw new DataError('address_not_found');
  const json = unwrap(await db.rpc('set_my_order_address', { p_order_id: id, p_address_id: addressId }));
  if (!json) throw new DataError('order_not_found');
  return toOrder(json as unknown as Parameters<typeof toOrder>[0]);
}

/** Owner moves an order to (or back from) the "Archived" view of their order list. */
export async function archiveOrder(db: Db, id: string, archived: boolean): Promise<Order> {
  const json = unwrap(await db.rpc('archive_my_order', { p_order_id: id, p_archived: archived }));
  if (!json) throw new DataError('order_not_found');
  return toOrder(json as unknown as Parameters<typeof toOrder>[0]);
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
/**
 * Owner cancels some items of an order, each line whole, until it ships
 * (`order_not_cancellable` after; `invalid_input` 'items' for none or one that isn't in it).
 * The rest keep coming, repriced; the cancelled items' card refund is asked of Stripe
 * here. Every line is the whole order, cancelled as cancelOrder does.
 */
export async function cancelOrderItems(db: Db, id: string, productIds: unknown): Promise<Order> {
  if (!Array.isArray(productIds) || !productIds.length || !productIds.every((p) => typeof p === 'string' && p !== '')) {
    throw new DataError('invalid_input', 'items', 'Choose the items to cancel.');
  }
  const json = unwrap(await db.rpc('cancel_my_items', { p_order_id: id, p_product_ids: [...new Set(productIds as string[])] }));
  if (!json) throw new DataError('order_not_found');
  const order = toOrder(json as unknown as Parameters<typeof toOrder>[0]);
  if (order.paymentMethod !== 'card') return order;
  const pending = order.status === 'cancelled'
    ? order.refund?.status === 'pending'
    : order.cancellations?.at(-1)?.refund.status === 'pending';
  if (!pending) return order;
  try {
    if (order.status === 'cancelled') await refundOrder(id);
    else await refundCancellation(order.cancellations!.at(-1)!.id);
  } catch (err) {
    console.error('[orders] refund after cancelling items failed', id, err);
  }
  return (await getOrder(db, id)) ?? order;
}

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
