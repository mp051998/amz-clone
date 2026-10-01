import type { Db } from '../db/client';
import { buyAgainItems, pastPurchases, type BuyAgainItem } from '../buy-again';
import type { Market } from '../types';
import { getProducts } from './catalog';
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
