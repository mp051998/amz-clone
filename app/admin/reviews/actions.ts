'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertStoreReview, isModerationAction, moderateReview, queueView } from '@/lib/data/admin-reviews';
import { DataError } from '@/lib/data/errors';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { adminClient } from '../guard';

/**
 * Keep, hide or delete one review (bound to the review id, the action and the queue view the
 * admin was on, all checked here since a client can send anything), then back to that view.
 */
export async function reviewAction(reviewId: string, action: string, view: string): Promise<void> {
  const store = await getMarketplace();
  const back = (qs: string) => {
    const v = queueView(view);
    return storePath(store, `/admin/reviews?${v === 'reported' ? '' : `view=${v}&`}${qs}`);
  };
  if (typeof reviewId !== 'string' || !isModerationAction(action)) redirect(back('error=review_not_found'));
  const { client, error } = await adminClient();
  if (error) redirect(back('error=forbidden'));
  let code: string | null = null;
  try {
    await assertStoreReview(client, store.id, reviewId);
    await moderateReview(client, reviewId, action);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  revalidatePath('/', 'layout');
  redirect(back(code ? `error=${encodeURIComponent(code)}` : `done=${action}`));
}
