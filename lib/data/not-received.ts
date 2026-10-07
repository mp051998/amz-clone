import 'server-only';
import type { Db } from '../db/client';
import type { OrderReturn } from '../types';
import { unwrap } from './errors';
import { refundReturn } from './refunds';
import { getOrderReturns, toReturn } from './returns';

/**
 * "Package didn't arrive": the caller's order was marked delivered but never turned up. The
 * database checks it can be reported (delivered, within 30 days, nothing returned from it) and
 * refunds the whole order at once; a card refund then goes to Stripe here (and is retried by an
 * admin if that fails).
 */
export async function reportNotReceived(db: Db, orderId: string): Promise<OrderReturn> {
  const r = toReturn(unwrap(await db.rpc('report_not_received', { p_order_id: orderId })));
  if (r.refund?.status !== 'pending') return r;
  try {
    await refundReturn(r.id);
  } catch (err) {
    console.error('[not received] card refund failed', r.id, err);
  }
  return (await getOrderReturns(db, orderId))?.returns.find((x) => x.id === r.id) ?? r;
}
