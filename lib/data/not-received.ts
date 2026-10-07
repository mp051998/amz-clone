import 'server-only';
import type { Db } from '../db/client';
import type { OrderReturn, ReturnResolution } from '../types';
import { DataError, unwrap } from './errors';
import { refundReturn } from './refunds';
import { getOrderReturns, toReturn } from './returns';

/** 'refund' when absent or blank, 'replacement', or invalid_input (resolution). */
export function parseMissingResolution(v: unknown): ReturnResolution {
  if (v == null || v === '' || v === 'refund') return 'refund';
  if (v === 'replacement') return 'replacement';
  throw new DataError('invalid_input', 'resolution');
}

/**
 * "Package didn't arrive": the caller's order was marked delivered but never turned up. The
 * database checks it can be reported (delivered, within 30 days, nothing returned from it), then
 * either refunds the whole order at once or, for 'replacement', sends every item again at no
 * charge (when all of it is on sale and in stock). A card refund then goes to Stripe here (and is
 * retried by an admin if that fails).
 */
export async function reportNotReceived(db: Db, orderId: string, resolution: unknown = 'refund'): Promise<OrderReturn> {
  // a refund leaves p_resolution out, so it still works on a database without replacements
  const args = parseMissingResolution(resolution) === 'replacement' ? { p_order_id: orderId, p_resolution: 'replacement' } : { p_order_id: orderId };
  const r = toReturn(unwrap(await db.rpc('report_not_received', args)));
  if (r.refund?.status !== 'pending') return r;
  try {
    await refundReturn(r.id);
  } catch (err) {
    console.error('[not received] card refund failed', r.id, err);
  }
  return (await getOrderReturns(db, orderId))?.returns.find((x) => x.id === r.id) ?? r;
}
