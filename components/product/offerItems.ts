import type { PublicMarketplace } from '@/lib/contracts';
import type { SellerRating } from '@/lib/data/seller-feedback';
import { storePath } from '@/lib/marketplace';
import { conditionLabel } from '@/lib/offers';
import type { Product } from '@/lib/types';
import type { OfferItem } from './Offers';

/** "92% positive (25 ratings)" */
export function positiveText(r: SellerRating): string {
  return `${r.positivePct}% positive (${r.ratings.toLocaleString('en-US')} ${r.ratings === 1 ? 'rating' : 'ratings'})`;
}

/** A product or one of its offers, as an offer row. Pure — unit-testable. */
export function offerItem(
  x: Product,
  o: { store: Pick<PublicMarketplace, 'id'>; priceText: string; rating?: SellerRating; delivery?: string; featured?: boolean },
): OfferItem {
  return {
    id: x.id,
    priceText: o.priceText,
    condition: conditionLabel(x.condition),
    ...(x.conditionNote ? { note: x.conditionNote } : {}),
    seller: x.seller,
    sellerHref: storePath(o.store, `/seller?name=${encodeURIComponent(x.seller)}`),
    ...(o.rating?.ratings ? { sellerRating: positiveText(o.rating) } : {}),
    shipsFrom: x.shipsFrom,
    ...(o.delivery ? { delivery: o.delivery } : {}),
    ...(o.featured ? { featured: true } : {}),
    // a product that comes in sizes goes in the cart from its own page (offers never have sizes)
    ...(x.sizes ? { optionsHref: storePath(o.store, `/product/${encodeURIComponent(x.id)}`) } : {}),
  };
}
