'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertStoreAnswer, assertStoreQuestion, keepAnswer, questionView } from '@/lib/data/admin-questions';
import { DataError } from '@/lib/data/errors';
import { deleteAnswer, deleteQuestion } from '@/lib/data/questions';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import type { PublicMarketplace } from '@/lib/contracts';
import { adminClient } from '../guard';

/** Back to the queue view the admin was on, with `qs` (done= or error=). */
function backTo(store: Pick<PublicMarketplace, 'id'>, view: string, qs: string): string {
  const v = questionView(view);
  return storePath(store, `/admin/questions?${v === 'unanswered' ? '' : `view=${v}&`}${qs}`);
}

/**
 * Delete one question (with its answers) or one answer, bound to the kind, the id and the view
 * the admin was on (all checked here, since a client can send anything), then back to that view.
 */
export async function deleteQaAction(kind: string, id: string, view: string): Promise<void> {
  const store = await getMarketplace();
  const back = (qs: string) => backTo(store, view, qs);
  if (typeof id !== 'string' || (kind !== 'question' && kind !== 'answer')) redirect(back('error=question_not_found'));
  const { client, error } = await adminClient();
  if (error) redirect(back('error=forbidden'));
  let code: string | null = null;
  try {
    if (kind === 'question') {
      await assertStoreQuestion(client, store.id, id);
      await deleteQuestion(client, id);
    } else {
      await assertStoreAnswer(client, store.id, id);
      await deleteAnswer(client, id);
    }
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  revalidatePath('/', 'layout');
  redirect(back(code ? `error=${encodeURIComponent(code)}` : `done=${kind}`));
}

/** Keep a reported answer (its reports so far are resolved), then back to the view the admin was on. */
export async function keepAnswerAction(id: string, view: string): Promise<void> {
  const store = await getMarketplace();
  const back = (qs: string) => backTo(store, view, qs);
  if (typeof id !== 'string') redirect(back('error=answer_not_found'));
  const { client, error } = await adminClient();
  if (error) redirect(back('error=forbidden'));
  let code: string | null = null;
  try {
    await assertStoreAnswer(client, store.id, id);
    await keepAnswer(client, id);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  revalidatePath('/', 'layout');
  redirect(back(code ? `error=${encodeURIComponent(code)}` : 'done=keep'));
}
