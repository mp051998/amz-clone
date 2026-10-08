import type { Db } from '../db/client';
import { buyAgainItems, pastPurchases, type BuyAgainItem } from '../buy-again';
import type { Market } from '../types';
import { getProducts } from './catalog';
import { unwrap } from './errors';
import { listOrders } from './orders';

/** Orders read for Buy again; a shopper past this sees what they bought most recently. */
const ORDERS_READ = 100;
export const BUY_AGAIN_MAX = 60;

/** What the caller bought in this store, newest first, with each product's price and stock now. */
export async function buyAgain(db: Db, market: Market, limit = BUY_AGAIN_MAX): Promise<BuyAgainItem[]> {
  const past = pastPurchases(await listOrders(db, market, { limit: ORDERS_READ })).slice(0, limit);
  const products = await getProducts(db, past.map((x) => x.productId), { includeArchived: true });
  return buyAgainItems(past, products.filter((p) => p.market === market));
}

/** The caller's latest order with a product on it, for the product page's "You last purchased this item on …". */
export interface LastPurchase {
  orderId: string;
  at: string;
}

/**
 * The latest placed order of `userId`'s with `productId` still on it (a line cancelled out of an
 * order leaves it), or null. Cancelled and unpaid orders don't count.
 */
export async function lastPurchase(db: Db, userId: string, productId: string): Promise<LastPurchase | null> {
  const rows = unwrap(
    await db
      .from('orders')
      .select('id, created_at, placed_at, order_items!inner(product_id)')
      .eq('user_id', userId)
      .eq('status', 'placed')
      .eq('order_items.product_id', productId)
      .order('created_at', { ascending: false })
      .limit(1),
  );
  const o = rows[0];
  return o ? { orderId: o.id, at: o.placed_at ?? o.created_at } : null;
}
