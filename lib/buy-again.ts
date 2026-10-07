import type { Order, Product } from './types';

/** A product from the shopper's placed orders, once however often they bought it. */
export interface PastPurchase {
  productId: string;
  /** as bought, for when the product is gone */
  title: string;
  image: string;
  lastBoughtAt: string;
  lastOrderId: string;
  /** how many placed orders it was in */
  orders: number;
}

/** Whether a past purchase can go back in the cart now. */
export type Availability = 'available' | 'sold_out' | 'gone';

export interface BuyAgainItem extends PastPurchase {
  /** the product as it is now; null once it's no longer in this store's catalog */
  product: Product | null;
  availability: Availability;
}

const placedAt = (o: Order) => o.placedAt ?? o.createdAt;

/** Each product once, most recently bought first. Cancelled and unpaid orders don't count. */
export function pastPurchases(orders: readonly Order[]): PastPurchase[] {
  const out = new Map<string, PastPurchase>();
  const placed = orders.filter((o) => o.status === 'placed').sort((a, b) => Date.parse(placedAt(b)) - Date.parse(placedAt(a)));
  for (const o of placed) {
    for (const it of o.items) {
      const seen = out.get(it.productId);
      if (seen) seen.orders++;
      else out.set(it.productId, { productId: it.productId, title: it.title, image: it.image, lastBoughtAt: placedAt(o), lastOrderId: o.id, orders: 1 });
    }
  }
  return [...out.values()];
}

export function availabilityOf(p: Product | null | undefined): Availability {
  if (!p || p.archived) return 'gone';
  return p.stock > 0 ? 'available' : 'sold_out';
}

const RANK: Record<Availability, number> = { available: 0, sold_out: 1, gone: 2 };

/** The first `n` you can buy right now, for the home page's "Buy again" row. */
export function buyableAgain(items: readonly BuyAgainItem[], n: number): (BuyAgainItem & { product: Product })[] {
  return items.filter((x): x is BuyAgainItem & { product: Product } => x.availability === 'available' && x.product != null).slice(0, n);
}

/** Past purchases with their products as they are now: the ones you can buy first, each lot newest first. */
export function buyAgainItems(past: readonly PastPurchase[], products: readonly Product[]): BuyAgainItem[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return past
    .map((x) => {
      const product = byId.get(x.productId) ?? null;
      return { ...x, product, availability: availabilityOf(product) };
    })
    .sort((a, b) => RANK[a.availability] - RANK[b.availability]);
}
