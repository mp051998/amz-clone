import type { Db } from '../db/client';
import type { ReturnReason } from '../types';
import { unwrap } from './errors';
import { STORE_FAULT_REASONS } from './returns';

/** A product-side reason a product usually comes back for (not "no longer needed" and the like). */
export type ProductReturnReason = 'damaged' | 'defective' | 'wrong_item' | 'missing_parts' | 'not_as_described';

export interface FrequentReturns {
  /** the usual reason, when it's about the product itself */
  reason: ProductReturnReason | null;
}

/**
 * "Frequently returned item" (product_return_signal(), 20261108090000): set when, over the last
 * 90 days, at least 1 delivered unit in 10 came back (10+ units, 2+ returns). null otherwise, or
 * before the migration.
 */
export async function frequentlyReturned(db: Db, productId: string): Promise<FrequentReturns | null> {
  const res = await db.rpc('product_return_signal', { p_product: productId });
  if (res.error?.code === 'PGRST202') return null; // not migrated yet
  const json = unwrap(res) as { frequent?: unknown; reason?: unknown } | null;
  if (json?.frequent !== true) return null;
  const reason = (STORE_FAULT_REASONS as readonly unknown[]).includes(json.reason) ? (json.reason as ReturnReason as ProductReturnReason) : null;
  return { reason };
}
