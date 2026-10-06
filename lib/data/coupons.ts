import type { Db } from '../db/client';
import type { Market, Product } from '../types';
import { getProducts } from './catalog';
import { unwrap } from './errors';

/**
 * Coupons: some products carry a percent-off coupon. A signed-in shopper applies
 * ("clips") it; while it's applied, its percent comes off every unit of that
 * product in their cart and orders. The database does the pricing (cart_json and
 * place_order); this module reads coupons and applies or removes them.
 */

export interface Coupon {
  percentOff: number;
  /** applied by the caller (always false signed out) */
  clipped: boolean;
}

/** What a coupon takes off one unit, as the database rounds it. */
export function couponUnitSavings(unitMinor: number, percentOff: number): number {
  return Math.round((unitMinor * percentOff) / 100);
}

/** A product's coupon and whether the caller has applied it, or null (none, or before the migration). */
export async function couponFor(db: Db, productId: string, signedIn: boolean): Promise<Coupon | null> {
  const [coupon, clip] = await Promise.all([
    db.from('coupons').select('percent_off').eq('product_id', productId).maybeSingle(),
    signedIn ? db.from('coupon_clips').select('product_id').eq('product_id', productId).maybeSingle() : null,
  ]);
  if (coupon.error || !coupon.data) return null;
  return { percentOff: coupon.data.percent_off, clipped: Boolean(clip && !clip.error && clip.data) };
}

/** Coupon percents for a set of products (absent ones have none). Empty on error. */
export async function couponPercents(db: Db, productIds: string[]): Promise<Map<string, number>> {
  if (!productIds.length) return new Map();
  const { data, error } = await db.from('coupons').select('product_id, percent_off').in('product_id', productIds);
  if (error || !data) return new Map();
  return new Map(data.map((c) => [c.product_id, c.percent_off]));
}

/** A product on sale with a coupon, for the coupons page. */
export interface CouponOffer {
  product: Product;
  percentOff: number;
  clipped: boolean;
}

/**
 * Every coupon in a store on a product that's on sale (archived ones are left out), biggest
 * percent first, with whether the caller has applied it. Empty before the migration.
 */
export async function listCouponOffers(db: Db, market: Market, signedIn: boolean): Promise<CouponOffer[]> {
  const [coupons, clips] = await Promise.all([
    db.from('coupons').select('product_id, percent_off').order('percent_off', { ascending: false }).order('product_id'),
    signedIn ? db.from('coupon_clips').select('product_id') : null,
  ]);
  if (coupons.error || !coupons.data?.length) return [];
  const pct = new Map(coupons.data.map((c) => [c.product_id, c.percent_off]));
  const clipped = new Set(clips && !clips.error ? clips.data.map((c) => c.product_id) : []);
  const products = await getProducts(db, [...pct.keys()]);
  return products
    .filter((p) => p.market === market)
    .map((p) => ({ product: p, percentOff: pct.get(p.id)!, clipped: clipped.has(p.id) }));
}

/** Apply a product's coupon for the caller (idempotent). */
export async function clipCoupon(db: Db, productId: string): Promise<Coupon> {
  const json = unwrap(await db.rpc('clip_coupon', { p_product: productId })) as { percent_off: number };
  return { percentOff: json.percent_off, clipped: true };
}

/** Stop applying a product's coupon for the caller. */
export async function unclipCoupon(db: Db, productId: string): Promise<void> {
  unwrap(await db.rpc('unclip_coupon', { p_product: productId }));
}
