import type { Db } from '../db/client';
import type { Market } from '../types';

/** A product's limit per customer and how much of it the shopper has used. */
export interface Allowance {
  limit: number;
  bought: number;
  /** how many more they can buy (0 once they've reached it) */
  left: number;
}

/**
 * For the signed-in shopper, each of these products that has a limit per customer, by id
 * (purchase_allowance RPC). Empty with none, signed out, or before the purchase limits migration.
 */
export async function purchaseAllowance(db: Db, market: Market, productIds: readonly string[]): Promise<Map<string, Allowance>> {
  const ids = [...new Set(productIds)];
  const out = new Map<string, Allowance>();
  if (!ids.length) return out;
  const { data, error } = await db.rpc('purchase_allowance', { p_market: market, p_product_ids: ids });
  if (error) return out;
  for (const r of data ?? []) out.set(r.product_id, { limit: r.max_per_customer, bought: r.bought, left: Math.max(0, r.max_per_customer - r.bought) });
  return out;
}
