import { adminOnly } from '@/lib/api/admin';
import { body, json, preflight, route } from '@/lib/api/http';
import { getStoreReturn, receiveReturn, rejectReturn, retryReturnRefund } from '@/lib/data/admin-returns';
import { DataError } from '@/lib/data/errors';

const ACTIONS = ['receive', 'reject', 'refund'] as const;

/**
 * POST /api/v1/admin/returns/:id/{receive,reject,refund}
 * - receive: the items are back; stock returned and the refund issued (card: on Stripe, see
 *   `refund.status`; pending until Stripe confirms, failed if it didn't go through).
 * - reject `{ note? }`: close it without a refund; the shopper sees the note (≤ 500 chars).
 * - refund: retry a received return's failed or stalled card refund. `refund_failed` (502).
 */
export const POST = route<{ id: string; action: string }>(async (ctx, { id, action }) => {
  await adminOnly(ctx);
  if (!(ACTIONS as readonly string[]).includes(action)) throw new DataError('not_found');
  await getStoreReturn(ctx.db, ctx.market, id);
  if (action === 'receive') return json({ return: await receiveReturn(ctx.db, id) });
  if (action === 'reject') return json({ return: await rejectReturn(ctx.db, id, (await body(ctx.req)).note) });
  return json({ return: await retryReturnRefund(ctx.db, id) });
});

export const OPTIONS = preflight;
