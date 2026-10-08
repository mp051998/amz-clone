import type { Db } from '../db/client';
import { unwrap } from './errors';

/**
 * A product's "Typical price" (typical_price(), 20270122090000): the median of its price at the end
 * of each of the last 90 days, in its own currency; null with under a week of prices, or before the
 * migration.
 */
export async function typicalPrice(db: Db, productId: string): Promise<number | null> {
  const res = await db.rpc('typical_price', { p_product: productId });
  if (res.error?.code === 'PGRST202') return null; // not migrated yet
  const minor = unwrap(res) as unknown;
  return typeof minor === 'number' && minor > 0 ? minor : null;
}

/**
 * The typical price to show struck through beside the price, as amazon.com does: only when the
 * price is below it and there's no list price above the price, which takes its place.
 */
export function typicalToShow(typicalMinor: number | null | undefined, priceMinor: number, listMinor?: number | null): number | null {
  if (listMinor != null && listMinor > priceMinor) return null;
  return typicalMinor != null && typicalMinor > priceMinor ? typicalMinor : null;
}
