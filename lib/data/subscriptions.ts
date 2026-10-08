import type { Db } from '../db/client';
import type { Database } from '../db/database.types';
import type { Market, Order, PaymentMethod, Subscription } from '../types';
import { unwrap } from './errors';
import { toOrder, toSubscription } from './map';

/**
 * Subscribe & Save. Shoppers read their subscriptions through row-level security; every change
 * goes through the database's functions, which check the product, the address and the payment
 * method, place the first delivery on signing up, and place the rest themselves (hourly).
 */

type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row'];

/**
 * The caller's subscriptions in a store, newest first: the active ones, or with
 * includeCancelled those cancelled too. Empty when signed out (or before the migration lands).
 */
export async function listSubscriptions(db: Db, market: Market, opts: { includeCancelled?: boolean } = {}): Promise<Subscription[]> {
  let q = db.from('subscriptions').select('*').eq('market_id', market);
  if (!opts.includeCancelled) q = q.eq('status', 'active');
  const { data, error } = await q.order('created_at', { ascending: false });
  return error || !data ? [] : (data as SubscriptionRow[]).map(toSubscription);
}

/** The caller's active subscription to a product, or null. */
export async function subscriptionFor(db: Db, productId: string): Promise<Subscription | null> {
  const { data, error } = await db.from('subscriptions').select('*').eq('product_id', productId).eq('status', 'active').maybeSingle();
  return error || !data ? null : toSubscription(data as SubscriptionRow);
}

/** How a store takes payment for deliveries nobody is at the checkout for (none before the migration). */
export async function subscribeMethods(db: Db, market: Market): Promise<PaymentMethod[]> {
  const { data, error } = await db.from('markets').select('subscribe_methods').eq('id', market).maybeSingle();
  return error || !data ? [] : ((data as { subscribe_methods: string[] }).subscribe_methods as PaymentMethod[]);
}

export interface SubscribeInput {
  market: Market;
  productId: string;
  qty: number;
  everyMonths: number;
  addressId: string;
  paymentMethod: string;
}

/**
 * Subscribe the caller to a product and place its first delivery now. Errors: product_not_found,
 * subscribe_unavailable, already_subscribed, insufficient_stock, address_not_found,
 * payment_method_unavailable, insufficient_balance, invalid_input (detail qty / every_months).
 */
export async function subscribe(db: Db, input: SubscribeInput): Promise<{ subscription: Subscription; order: Order }> {
  const json = unwrap(
    await db.rpc('subscribe', {
      p_market: input.market,
      p_product: input.productId,
      p_qty: input.qty,
      p_every: input.everyMonths,
      p_address: input.addressId,
      p_payment_method: input.paymentMethod,
    }),
  ) as unknown as { subscription: SubscriptionRow; order: Parameters<typeof toOrder>[0] };
  return { subscription: toSubscription(json.subscription), order: toOrder(json.order) };
}

export interface SubscriptionPatch {
  qty?: number;
  everyMonths?: number;
  addressId?: string;
  paymentMethod?: string;
}

/** Change how many, how often, where to or how it's paid; what's left out stays as it is. */
export async function updateSubscription(db: Db, id: string, patch: SubscriptionPatch): Promise<Subscription> {
  const json = unwrap(
    await db.rpc('update_subscription', {
      p_id: id,
      ...(patch.qty != null ? { p_qty: patch.qty } : {}),
      ...(patch.everyMonths != null ? { p_every: patch.everyMonths } : {}),
      ...(patch.addressId ? { p_address: patch.addressId } : {}),
      ...(patch.paymentMethod ? { p_payment_method: patch.paymentMethod } : {}),
    }),
  );
  return toSubscription(json as unknown as SubscriptionRow);
}

/** Skip the next delivery: it moves on by one frequency. */
export async function skipSubscription(db: Db, id: string): Promise<Subscription> {
  return toSubscription(unwrap(await db.rpc('skip_subscription', { p_id: id })) as unknown as SubscriptionRow);
}

/** Cancel: nothing more is delivered. Orders already placed stay as they are. */
export async function cancelSubscription(db: Db, id: string): Promise<Subscription> {
  return toSubscription(unwrap(await db.rpc('cancel_subscription', { p_id: id })) as unknown as SubscriptionRow);
}
