import type { Db } from '../db/client';
import type { Market, Order, PaymentMethod, ShipSpeed } from '../types';
import type { BuyNow } from '../buy-now';
import { INSTRUCTIONS_MAX } from '../contracts';
import { isEmiMonths } from '../emi';
import { parseAddress, type AddressFieldsInput } from './addresses';
import { DataError, unwrap } from './errors';
import { toOrder } from './map';
import { expireCardCheckout } from './payments';
import { refundCancellation, refundOrder } from './refunds';
import { readPromoCode } from '../promo';
import { readGst } from '../gst';
import { getPickupPoint } from './pickup';
import { isBankOfferMethod } from '../bank-offers';

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['card', 'giftcard', 'upi', 'netbanking', 'cod', 'emi', 'amazonpay'];

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === 'string' && (PAYMENT_METHODS as readonly string[]).includes(v);
}

export const GIFT_NOTE_MAX = 240;

export interface PlaceOrderInput {
  paymentMethod: PaymentMethod;
  shipping: AddressFieldsInput;
  /**
   * collect the order at this pickup point (an id from listPickupPoints) instead: `shipping` then
   * needs only the name and phone, and the point's address stands in for the rest
   */
  pickupPoint?: string;
  /** mark the order as a gift, with an optional note for the recipient */
  gift?: { message?: unknown; wrap?: boolean };
  /**
   * delivery speed; 'fast' only when offered right now (see deliveryOptions), 'day' only for a Plus
   * member with a Delivery Day, 'no_rush' only where the store has a No-Rush reward (noRushReward)
   */
  speed?: ShipSpeed;
  /** Buy Now: order just this product (the cart is left as it is) */
  buyNow?: BuyNow;
  /** EMI only: how many monthly payments (3, 6, 9 or 12; the store takes 3 when not said) */
  emiMonths?: number;
  /** a promotion code typed at checkout (blank is none) */
  promoCode?: string | null;
  /** net banking and EMI: the shopper's bank, whose best Bank Offer comes off the items (ignored for other methods) */
  bank?: unknown;
  /** India: a GST invoice made out to this GSTIN and business name (a blank GSTIN is none) */
  gst?: { gstin: unknown; name: unknown };
}

export const BANK_MAX = 40;

/** The bank named at checkout, trimmed (blank is none); longer than BANK_MAX is refused (invalid_input). */
export function readBank(v: unknown): string | undefined {
  const bank = typeof v === 'string' ? v.trim() : '';
  if (bank.length > BANK_MAX) throw new DataError('invalid_input', 'bank', 'Choose your bank from the list.');
  return bank || undefined;
}

export function isShipSpeed(v: unknown): v is ShipSpeed {
  return v === 'standard' || v === 'fast' || v === 'day' || v === 'no_rush';
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
  const point = input.pickupPoint ? await getPickupPoint(db, market, input.pickupPoint) : null;
  if (input.pickupPoint && !point) throw new DataError('pickup_point_not_found');
  // a pickup point's address stands in for the shopper's (no courier, so no instructions)
  const shipping = point
    ? { fullName: input.shipping.fullName, phone: input.shipping.phone, line1: point.name, line2: point.line1, city: point.city, state: point.state, postcode: point.postcode }
    : input.shipping;
  const a = parseAddress(market, shipping);
  const note = input.gift ? readGiftNote(input.gift.message) : undefined;
  const emi = input.paymentMethod === 'emi' ? input.emiMonths : undefined;
  if (emi !== undefined && !isEmiMonths(emi)) throw new DataError('invalid_input', 'emiMonths', 'Choose 3, 6, 9 or 12 monthly payments.');
  const promo = readPromoCode(input.promoCode);
  const bank = isBankOfferMethod(input.paymentMethod) ? readBank(input.bank) : undefined;
  // GST details are checked before anything is reserved, and added once the order exists
  const gst = input.gst ? readGst(input.gst.gstin, input.gst.name) : null;
  if (gst && market !== 'IN') throw new DataError('gst_unavailable');
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
        ...(point ? { pickup_point: point.id } : {}),
      },
      // sent only for gifts, so ordinary checkouts don't depend on the gift migration
      ...(input.gift ? { p_gift: true, ...(note ? { p_gift_message: note } : {}), ...(input.gift.wrap ? { p_gift_wrap: true } : {}) } : {}),
      // likewise only for a speed other than standard
      ...(input.speed && input.speed !== 'standard' ? { p_speed: input.speed } : {}),
      ...(input.buyNow
        ? { p_buy: { product_id: input.buyNow.productId, qty: input.buyNow.qty, ...(input.buyNow.protection ? { protection: true } : {}), ...(input.buyNow.size ? { size: input.buyNow.size } : {}) } }
        : {}),
      ...(emi !== undefined ? { p_emi_months: emi } : {}),
      ...(promo ? { p_promo_code: promo } : {}),
      ...(bank ? { p_bank: bank } : {}),
    }),
  );
  const order = toOrder(json as unknown as Parameters<typeof toOrder>[0]);
  if (!gst) return order;
  // the order is placed either way; the details can still be added until it ships
  return setOrderGst(db, order.id, gst.gstin, gst.name).catch(() => order);
}

/**
 * Owner adds, changes or (blank GSTIN) removes an India order's GST invoice details while it's
 * unpaid or being prepared: `gst_locked` once it ships or is cancelled, `gst_unavailable` in other
 * stores, `invalid_input` (`gstin` | `gstName`) for details that don't check out.
 */
export async function setOrderGst(db: Db, id: string, gstin: unknown, name: unknown): Promise<Order> {
  const gst = readGst(gstin, name);
  const json = unwrap(await db.rpc('set_order_gst', { p_order_id: id, p_gstin: gst?.gstin ?? '', p_name: gst?.name ?? '' }));
  if (!json) throw new DataError('order_not_found');
  return toOrder(json as unknown as Parameters<typeof toOrder>[0]);
}

/** The store's gift wrap fee per item (minor units); null when it doesn't wrap, or until the gift wrap migration lands. */
export async function giftWrapFee(db: Db, market: Market): Promise<number | null> {
  const { data, error } = await db.from('markets').select('gift_wrap_minor').eq('id', market).maybeSingle();
  return error || !data ? null : data.gift_wrap_minor;
}

/** The reward a No-Rush order earns in this store (minor units, to the gift card balance once it ships); null where it isn't offered. */
export async function noRushReward(db: Db, market: Market): Promise<number | null> {
  const { data, error } = await db.from('markets').select('no_rush_reward_minor').eq('id', market).maybeSingle();
  return error || !data ? null : data.no_rush_reward_minor;
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

/**
 * How the caller paid for their latest placed order in a store, so checkout can start on it as
 * Amazon does; null with no orders (or when it can't be read: checkout then starts on the first).
 */
export async function lastPaymentMethod(db: Db, market: Market): Promise<PaymentMethod | null> {
  const { data, error } = await db
    .from('orders')
    .select('payment_method')
    .eq('market_id', market)
    .not('placed_at', 'is', null)
    .order('placed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return isPaymentMethod(data?.payment_method) ? data.payment_method : null;
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
