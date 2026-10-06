'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getStoreReturn, receiveReturn, rejectReturn, retryReturnRefund, returnFilter } from '@/lib/data/admin-returns';
import { DataError } from '@/lib/data/errors';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { adminClient } from '../guard';

const MOVES = ['receive', 'reject', 'refund'] as const;
type Move = (typeof MOVES)[number];

/**
 * One admin move on a return (bound to the return id, the move and where the admin was: a returns
 * list filter, or `order` for the order page; all checked here since a client can send anything).
 * Reject reads its note from the form. Back to the same page with a notice or the error.
 */
export async function returnAction(returnId: string, move: string, from: string, formData?: FormData): Promise<void> {
  const store = await getMarketplace();
  let orderId: string | null = null;
  const back = (qs: string) => {
    // the order page's notices are the return ones, prefixed
    if (from === 'order' && orderId) return storePath(store, `/admin/orders/${encodeURIComponent(orderId)}?${qs.replace(/^done=/, 'done=return_')}`);
    const f = returnFilter(from);
    return storePath(store, `/admin/returns?${f === 'open' ? '' : `filter=${f}&`}${qs}`);
  };
  if (typeof returnId !== 'string' || !(MOVES as readonly string[]).includes(move)) redirect(back('error=return_not_found'));
  const { client, error } = await adminClient();
  if (error) redirect(back('error=forbidden'));
  let code: string | null = null;
  let done: string = move;
  try {
    orderId = (await getStoreReturn(client, store.id, returnId)).order.id;
    if ((move as Move) === 'receive') {
      // the refund can lag behind the receipt (card refunds on Stripe); say so
      const r = await receiveReturn(client, returnId);
      if (r.refund?.status !== 'succeeded') done = `receive_${r.refund?.status ?? 'pending'}`;
    } else if ((move as Move) === 'reject') await rejectReturn(client, returnId, formData?.get('note'));
    else await retryReturnRefund(client, returnId);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  revalidatePath('/', 'layout');
  redirect(back(code ? `error=${encodeURIComponent(code)}` : `done=${done}`));
}
