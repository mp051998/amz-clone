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
 * One admin move on a return (bound to the return id, the move and the list filter the admin was
 * on, all checked here since a client can send anything); reject reads its note from the form.
 * Back to the same list with a notice or the error.
 */
export async function returnAction(returnId: string, move: string, filter: string, formData?: FormData): Promise<void> {
  const store = await getMarketplace();
  const back = (qs: string) => {
    const f = returnFilter(filter);
    return storePath(store, `/admin/returns?${f === 'open' ? '' : `filter=${f}&`}${qs}`);
  };
  if (typeof returnId !== 'string' || !(MOVES as readonly string[]).includes(move)) redirect(back('error=return_not_found'));
  const { client, error } = await adminClient();
  if (error) redirect(back('error=forbidden'));
  let code: string | null = null;
  let done: string = move;
  try {
    await getStoreReturn(client, store.id, returnId);
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
