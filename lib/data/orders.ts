import type { Db } from '../db/client';
import type { Market, Order, PaymentMethod } from '../types';
import { parseAddress, type AddressFieldsInput } from './addresses';
import { DataError, unwrap } from './errors';
import { toOrder } from './map';

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['card', 'giftcard', 'upi', 'netbanking', 'cod', 'emi', 'amazonpay'];

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === 'string' && (PAYMENT_METHODS as readonly string[]).includes(v);
}

export interface PlaceOrderInput {
  paymentMethod: PaymentMethod;
  shipping: AddressFieldsInput;
}

/**
 * Turn the caller's cart into an order (place_order RPC): stock is locked and
 * reserved, every line priced from the catalog, totals computed by the DB.
 * Card orders come back `awaiting_payment` — hand them to startCardCheckout.
 */
export async function placeOrder(db: Db, market: Market, input: PlaceOrderInput): Promise<Order> {
  const a = parseAddress(market, input.shipping);
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
    }),
  );
  return toOrder(json as unknown as Parameters<typeof toOrder>[0]);
}

const ORDER_SELECT = '*, order_items(*)';

/** The caller's placed orders in a store, newest first. */
export async function listOrders(db: Db, market: Market, opts: { limit?: number } = {}): Promise<Order[]> {
  let q = db
    .from('orders')
    .select(ORDER_SELECT)
    .eq('market_id', market)
    .eq('status', 'placed')
    .order('created_at', { ascending: false });
  if (opts.limit) q = q.limit(opts.limit);
  return unwrap(await q).map((row) => toOrder(row));
}

export async function countOrders(db: Db, market: Market): Promise<number> {
  const res = await db.from('orders').select('id', { count: 'exact', head: true }).eq('market_id', market).eq('status', 'placed');
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
