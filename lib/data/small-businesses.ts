import type { Db } from '../db/client';
import type { Market } from '../types';
import { DataError, fromPostgrest, unwrap } from './errors';

/**
 * Small Business, as on Amazon: brands the store marks as small businesses (the store's own
 * designation, a demo's). Their products carry the badge, can be filtered for in search, and show
 * the brand's line about what it makes on their pages and its brand store.
 */
export interface SmallBusiness {
  /** the brand, as its products name it */
  brand: string;
  /** what it makes, shown with its products */
  story: string;
}

export const SMALL_BUSINESS_BRAND_MAX = 120;
export const SMALL_BUSINESS_STORY_MAX = 600;

/** A brand and its story, tidied, or an `invalid_input` error naming the field. */
export function parseSmallBusiness(input: { brand?: unknown; story?: unknown }): SmallBusiness {
  const brand = typeof input.brand === 'string' ? input.brand.trim() : '';
  if (!brand || brand.length > SMALL_BUSINESS_BRAND_MAX) {
    throw new DataError('invalid_input', 'brand', `Enter the brand as its products name it, up to ${SMALL_BUSINESS_BRAND_MAX} characters`);
  }
  return { brand, story: parseStory(input.story) };
}

function parseStory(v: unknown): string {
  const story = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (!story || story.length > SMALL_BUSINESS_STORY_MAX) {
    throw new DataError('invalid_input', 'story', `Say what the brand makes, up to ${SMALL_BUSINESS_STORY_MAX} characters`);
  }
  return story;
}

/** The store's small businesses, by brand. */
export async function listSmallBusinesses(db: Db, market: Market): Promise<SmallBusiness[]> {
  const res = await db.from('small_businesses').select('brand, story').eq('market_id', market).order('brand');
  // none before the small-business migration
  if (res.error?.code === '42P01' || res.error?.code === 'PGRST205') return [];
  return unwrap(res);
}

/** The brand's small-business entry in this store, or null when it isn't one. */
export async function getSmallBusiness(db: Db, market: Market, brand: string): Promise<SmallBusiness | null> {
  const res = await db.from('small_businesses').select('brand, story').eq('market_id', market).eq('brand', brand).maybeSingle();
  if (res.error?.code === '42P01' || res.error?.code === 'PGRST205') return null;
  return unwrap(res);
}

/**
 * Mark a brand this store sells as a small business (admins). `invalid_input` (`brand`) when none
 * of the store's products are from it; `small_business_exists` when it already is one.
 */
export async function addSmallBusiness(db: Db, market: Market, input: { brand?: unknown; story?: unknown }): Promise<SmallBusiness> {
  const sb = parseSmallBusiness(input);
  const sold = unwrap(await db.from('products').select('id').eq('market_id', market).eq('brand', sb.brand).limit(1));
  if (!sold.length) throw new DataError('invalid_input', 'brand', 'No product in this store is from that brand. Check its spelling on a product.');
  const res = await db.from('small_businesses').insert({ market_id: market, brand: sb.brand, story: sb.story });
  if (res.error?.code === '23505') throw new DataError('small_business_exists');
  if (res.error) throw fromPostgrest(res.error);
  return sb;
}

/** Change what a small business's entry says (admins); `small_business_not_found` when the brand isn't one. */
export async function updateSmallBusiness(db: Db, market: Market, brand: string, story: unknown): Promise<SmallBusiness> {
  const res = await db.from('small_businesses').update({ story: parseStory(story) }).eq('market_id', market).eq('brand', brand).select('brand, story').maybeSingle();
  if (res.error) throw fromPostgrest(res.error);
  if (!res.data) throw new DataError('small_business_not_found');
  return res.data;
}

/** Stop marking the brand as a small business (admins); `small_business_not_found` when it isn't one. */
export async function removeSmallBusiness(db: Db, market: Market, brand: string): Promise<void> {
  const res = await db.from('small_businesses').delete().eq('market_id', market).eq('brand', brand).select('brand');
  if (res.error) throw fromPostgrest(res.error);
  if (!res.data?.length) throw new DataError('small_business_not_found');
}

/** The brands this store sells (archived products' too), by name: what an admin can mark. */
export async function storeBrands(db: Db, market: Market): Promise<string[]> {
  const rows = unwrap(await db.from('products').select('brand').eq('market_id', market).is('offer_of', null).not('brand', 'is', null));
  return [...new Set(rows.map((r) => r.brand as string))].sort((a, b) => a.localeCompare(b));
}
