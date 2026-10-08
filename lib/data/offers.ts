import type { Db } from '../db/client';
import { offerSummary, type OfferSummary } from '../offers';
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

/**
 * "More Buying Choices" for search results: per product, how many other sellers' offers are on
 * sale and in stock and from what price (products with none are left out).
 */
export async function buyingChoices(db: Db, productIds: string[]): Promise<Map<string, OfferSummary>> {
  if (!productIds.length) return new Map();
  const rows = unwrap(
    await db
      .from('catalog_products_all')
      .select('*')
      .in('offer_of', productIds)
      .is('archived_at', null)
      .gt('stock', 0)
      .limit(productIds.length * OFFERS_MAX),
  );
  const byProduct = new Map<string, Product[]>();
  for (const offer of rows.map(toProduct)) {
    if (!offer.offerOf) continue;
    byProduct.set(offer.offerOf, [...(byProduct.get(offer.offerOf) ?? []), offer]);
  }
  return new Map([...byProduct].flatMap(([id, offers]) => {
    const s = offerSummary(offers);
    return s ? [[id, s] as const] : [];
  }));
}
