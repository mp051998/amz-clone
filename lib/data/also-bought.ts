import type { Db } from '../db/client';
import type { Market, Product } from '../types';
import { foldVariants } from '../variants';
import { getProducts } from './catalog';

/**
 * "Customers who bought this item also bought" (20261218090000_also_bought.sql): up to `n` of this
 * store's products on sale that the shoppers who bought this one bought too, in any of their
 * orders, most of those shoppers first, one option per variant group. A product only counts once
 * two different shoppers have bought both. Empty when there's nothing yet, and on an error (the
 * page goes on without it).
 */
export async function alsoBought(db: Db, product: Product, n = 8): Promise<Product[]> {
  const res = await db.rpc('also_bought', { p_product_id: product.id, p_limit: n + 4 });
  if (res.error) return [];
  const ids = ((res.data ?? []) as { id: string }[]).map((x) => x.id);
  const items = (await getProducts(db, ids)).filter((p) => p.market === product.market && !p.archived && p.id !== product.id);
  return foldVariants(items).slice(0, n);
}

/** How many cart products "Customers who bought items in your cart also bought" starts from. */
export const CART_ANCHORS = 3;

/**
 * "Customers who bought items in your cart also bought": this store's products in stock that the
 * buyers of the first few products in `cart` bought too, most of those shoppers across them first,
 * one option per variant group, leaving out what's in the cart and other options of it (another
 * seller's offer counts as its product). Empty when there's nothing yet, and on an error (the cart
 * goes on without it).
 */
export async function alsoBoughtWithCart(db: Db, market: Market, cart: readonly Product[], n = 8): Promise<Product[]> {
  const inCart = new Set(cart.flatMap((p) => [p.id, p.offerOf ?? p.id]));
  const anchors = [...new Set(cart.map((p) => p.offerOf ?? p.id))].slice(0, CART_ANCHORS);
  if (!anchors.length) return [];
  const lists = await Promise.all(anchors.map((id) => db.rpc('also_bought', { p_product_id: id, p_limit: 12 })));
  const shoppers = new Map<string, number>();
  for (const res of lists) {
    if (res.error) continue;
    for (const x of (res.data ?? []) as { id: string; shoppers: number }[]) shoppers.set(x.id, (shoppers.get(x.id) ?? 0) + x.shoppers);
  }
  const ids = [...shoppers.keys()].filter((id) => !inCart.has(id)).sort((a, b) => shoppers.get(b)! - shoppers.get(a)!);
  if (!ids.length) return [];
  const groups = new Set(cart.flatMap((p) => (p.variant ? [p.variant.group] : [])));
  const items = (await getProducts(db, ids)).filter((p) => p.market === market && !p.archived && p.stock > 0 && !(p.variant && groups.has(p.variant.group)));
  return foldVariants(items).slice(0, n);
}
