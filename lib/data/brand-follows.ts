import type { Db } from '../db/client';
import type { Market, Product } from '../types';
import { listProducts } from './catalog';
import { DataError, unwrap } from './errors';

/**
 * Brands a shopper follows (20261217090000_brand_follows.sql), as with "Follow" on Amazon's brand
 * stores: per store, and only a brand with something on sale there. "Brands you follow" shows
 * what's new from each.
 */

/** The most follows read for a store, newest first. */
export const BRAND_FOLLOWS_MAX = 50;
/** What "Brands you follow" shows of each brand. */
export const FOLLOWED_BRAND_PRODUCTS = 4;
export const BRAND_NAME_MAX = 120;

export interface FollowedBrand {
  brand: string;
  followedAt: string;
}

/** A followed brand with what's new from it here (none once nothing of it is on sale). */
export interface FollowedBrandFeed extends FollowedBrand {
  products: Product[];
}

const NOT_ON_SALE = 'Nothing from that brand is on sale in this store.';

/** A brand name as typed: trimmed, or an `invalid_input` when it's empty or too long. */
function brandName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name || name.length > BRAND_NAME_MAX) throw new DataError('invalid_input', 'brand', 'Name the brand.');
  return name;
}

/** The brands `userId` follows in this store, most recently followed first. */
export async function followedBrands(db: Db, market: Market, userId: string): Promise<FollowedBrand[]> {
  const rows = unwrap(
    await db
      .from('brand_follows')
      .select('brand, followed_at')
      .eq('user_id', userId)
      .eq('market_id', market)
      .order('followed_at', { ascending: false })
      .limit(BRAND_FOLLOWS_MAX),
  );
  return rows.map((r) => ({ brand: r.brand, followedAt: r.followed_at }));
}

/** Whether `userId` follows the brand (as the catalog spells it) in this store. */
export async function isFollowingBrand(db: Db, market: Market, userId: string, brand: string): Promise<boolean> {
  const row = unwrap(await db.from('brand_follows').select('brand').eq('user_id', userId).eq('market_id', market).eq('brand', brand).maybeSingle());
  return row != null;
}

/** Each followed brand with its newest products here, in the order they were followed. */
export async function followedBrandFeed(db: Db, market: Market, userId: string): Promise<FollowedBrandFeed[]> {
  const follows = await followedBrands(db, market, userId);
  return Promise.all(
    follows.map(async (f) => ({
      ...f,
      products: await listProducts(db, market, { brand: f.brand, order: 'fresh', limit: FOLLOWED_BRAND_PRODUCTS }).catch((): Product[] => []),
    })),
  );
}

/** Follow a brand in this store; its name as the catalog spells it. `not_found` (brand) when nothing of it is on sale here. */
export async function followBrand(db: Db, market: Market, brand: unknown): Promise<string> {
  const name = brandName(brand);
  try {
    return unwrap(await db.rpc('follow_brand', { p_market: market, p_brand: name }));
  } catch (err) {
    if (err instanceof DataError && err.code === 'not_found') throw new DataError('not_found', 'brand', NOT_ON_SALE);
    throw err;
  }
}

/** Stop following a brand in this store; whether it was followed. */
export async function unfollowBrand(db: Db, market: Market, brand: unknown): Promise<boolean> {
  return unwrap(await db.rpc('unfollow_brand', { p_market: market, p_brand: brandName(brand) }));
}
