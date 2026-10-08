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

export interface ReturnSignal {
  /** "Frequently returned item": over the last 90 days, at least 1 delivered unit in 10 came back (10+ units, 2+ returns) */
  frequent: FrequentReturns | null;
  /** "Customers usually keep this item": 20+ units delivered over the last 90 days, at most 1 in 50 back */
  usuallyKept: boolean;
  /**
   * "Fit: Runs small" or "Runs large", for a product that comes in sizes: over the last 90 days, 3+
   * units came back too small (or too large), twice as many as the other way, and size returns
   * were at least 1 delivered unit in 20
   */
  fit: Fit | null;
}

/** Which way a product's size returns lean. */
export type Fit = 'small' | 'large';

const NO_SIGNAL: ReturnSignal = { frequent: null, usuallyKept: false, fit: null };

/**
 * What a product's returns say about it (product_return_signal(), 20261108090000,
 * 20261128090000 and 20270121090000). Nothing before the migrations; `usuallyKept` is never set
 * alongside `frequent`, and `fit` can be either way.
 */
export async function returnSignal(db: Db, productId: string): Promise<ReturnSignal> {
  const res = await db.rpc('product_return_signal', { p_product: productId });
  if (res.error?.code === 'PGRST202') return NO_SIGNAL; // not migrated yet
  const json = unwrap(res) as { frequent?: unknown; kept?: unknown; reason?: unknown; fit?: unknown } | null;
  const fit = json?.fit === 'small' || json?.fit === 'large' ? json.fit : null;
  if (json?.frequent === true) {
    const reason = (STORE_FAULT_REASONS as readonly unknown[]).includes(json.reason) ? (json.reason as ReturnReason as ProductReturnReason) : null;
    return { frequent: { reason }, usuallyKept: false, fit };
  }
  return { frequent: null, usuallyKept: json?.kept === true, fit };
}

/** "Frequently returned item" alone (see returnSignal): `{reason}`, or null when it isn't. */
export async function frequentlyReturned(db: Db, productId: string): Promise<FrequentReturns | null> {
  return (await returnSignal(db, productId)).frequent;
}
