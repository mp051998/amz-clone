import 'server-only';
import type { Db } from '../db/client';
import type { OrderReturn } from '../types';
import { refundReturn } from './refunds';
import { getOrderReturns, requestMissingItems, type ReturnInput } from './returns';

/**
 * "Item missing from package": some of a delivered order's items weren't in the box. The database
 * checks them as it would a return (the windows, what's left, replacement-only items), then
 * refunds them at once, or for 'replacement' sends them again at no charge; nothing goes back. A
 * card refund then goes to Stripe here (and is retried by an admin if that fails).
 */
export async function reportMissingItems(db: Db, orderId: string, input: Omit<ReturnInput, 'reason'>): Promise<OrderReturn> {
  const r = await requestMissingItems(db, orderId, input);
  if (r.refund?.status !== 'pending') return r;
  try {
    await refundReturn(r.id);
  } catch (err) {
    console.error('[missing items] card refund failed', r.id, err);
  }
  return (await getOrderReturns(db, orderId))?.returns.find((x) => x.id === r.id) ?? r;
}
