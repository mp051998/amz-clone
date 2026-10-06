'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { DataError } from '@/lib/data/errors';
import { deleteAnswer, deleteQuestion } from '@/lib/data/questions';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';

async function remove(done: 'question' | 'answer', run: () => Promise<void>): Promise<void> {
  const store = await getMarketplace();
  const back = (qs: string) => storePath(store, `/account/questions?${qs}`);
  if (!(await readUser())) redirect(storePath(store, '/signin?next=/account/questions'));
  let code: string | null = null;
  try {
    await run();
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  revalidatePath('/', 'layout'); // the product page's questions
  redirect(back(code ? `error=${encodeURIComponent(code)}` : `done=${done}`));
}

/** Your Q&A → Delete a question, bound to its id (its answers go with it). */
export async function deleteMyQuestion(questionId: string): Promise<void> {
  await remove('question', async () => deleteQuestion(await db(), String(questionId)));
}

/** Your Q&A → Delete an answer, bound to its id. */
export async function deleteMyAnswer(answerId: string): Promise<void> {
  await remove('answer', async () => deleteAnswer(await db(), String(answerId)));
}
