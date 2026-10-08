'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { claimFilter, decideClaim } from '@/lib/data/atoz-claims';
import { DataError } from '@/lib/data/errors';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { adminClient } from '../guard';

const MOVES = ['grant', 'deny'] as const;

/**
 * An admin's decision on an A-to-z Guarantee claim (bound to the claim id, the move and the queue
 * filter the admin was on; all checked here since a client can send anything), with the note from
 * the form. Back to the same queue with a notice or the error.
 */
export async function claimAction(claimId: string, move: string, from: string, formData?: FormData): Promise<void> {
  const store = await getMarketplace();
  const back = (qs: string) => {
    const f = claimFilter(from);
    return storePath(store, `/admin/claims?${f === 'open' ? '' : `filter=${f}&`}${qs}`);
  };
  if (typeof claimId !== 'string' || !(MOVES as readonly string[]).includes(move)) redirect(back('error=claim_not_found'));
  const { client, error } = await adminClient();
  if (error) redirect(back('error=forbidden'));
  let failure: DataError | null = null;
  let done = move;
  try {
    const c = await decideClaim(client, claimId, move, formData?.get('note'));
    // a card refund can lag behind the decision; say so
    if (c.status === 'granted' && c.refund?.status !== 'succeeded') done = `grant_${c.refund?.status ?? 'pending'}`;
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    failure = err;
  }
  revalidatePath('/', 'layout');
  if (failure) {
    const qs = new URLSearchParams({ error: failure.code });
    if (failure.detail) qs.set('detail', failure.detail);
    redirect(back(qs.toString()));
  }
  redirect(back(`done=${done}`));
}
