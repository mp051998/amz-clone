import type { Db } from '../db/client';
import type { Market, Product } from '../types';
import { getProducts } from './catalog';
import { unwrap } from './errors';
import { toProduct } from './map';

/** Most renewed offers the storefront reads at a time. */
export const RENEWED_MAX = 60;

/** A renewed offer and the product it's an offer of (what it costs new). */
export interface RenewedOffer {
  offer: Product;
  product: Product;
}

/**
 * The store's Renewed storefront: other sellers' renewed offers that are on sale and in stock, in
 * the store's featured order (cheapest first for one product's), each with its product. An offer
 * whose product is off sale is left out.
 */
export async function listRenewed(db: Db, market: Market): Promise<RenewedOffer[]> {
  const rows = unwrap(
    await db
      .from('catalog_products_all')
      .select('*')
      .eq('market_id', market)
      // only an offer has a condition (products_offer_fields)
      .eq('condition', 'renewed')
      .is('archived_at', null)
      .gt('stock', 0)
      .order('position', { ascending: true })
      .order('price_minor', { ascending: true })
      .order('id', { ascending: true })
      .limit(RENEWED_MAX),
  );
  const offers = rows.map(toProduct);
  const byId = new Map((await getProducts(db, [...new Set(offers.flatMap((o) => (o.offerOf ? [o.offerOf] : [])))])).map((p) => [p.id, p]));
  return offers.flatMap((offer) => {
    const product = offer.offerOf ? byId.get(offer.offerOf) : undefined;
    return product ? [{ offer, product }] : [];
  });
}
