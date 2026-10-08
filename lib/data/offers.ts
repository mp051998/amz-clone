import type { Db } from '../db/client';
import type { Product } from '../types';
import { unwrap } from './errors';
import { toProduct } from './map';

/** Most offers of one product read at a time. */
export const OFFERS_MAX = 50;

/**
 * "Other sellers": the other sellers' offers of a product that are on sale and in stock, cheapest
 * first (then by id, so the order is stable).
 */
export async function listOffers(db: Db, productId: string): Promise<Product[]> {
  const rows = unwrap(
    await db
      .from('catalog_products_all')
      .select('*')
      .eq('offer_of', productId)
      .is('archived_at', null)
      .gt('stock', 0)
      .order('price_minor', { ascending: true })
      .order('id', { ascending: true })
      .limit(OFFERS_MAX),
  );
  return rows.map(toProduct);
}
