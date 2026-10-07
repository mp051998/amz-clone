'use server';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { DataError } from '@/lib/data/errors';
import { closeCase, getCase, openCase, replyToCase, type SupportCase } from '@/lib/data/support';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';

const text = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

/** "Contact us" → a new case, then its page; on an error, back to the form saying what was wrong. */
export async function openCaseAction(formData: FormData): Promise<void> {
  const store = await getMarketplace();
  const order = text(formData.get('order'));
  const topic = text(formData.get('topic'));
  if (!(await readUser())) redirect(storePath(store, '/signin?next=/customer-service/contact'));
  let created: SupportCase | null = null;
  let error = '';
  try {
    created = await openCase(await db(), store.id, { topic, subject: formData.get('subject'), body: formData.get('body'), orderId: order });
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    error = err.code === 'invalid_input' && err.detail ? `invalid_${err.detail}` : err.code;
  }
  if (!created) {
    const back = new URLSearchParams({ error });
    if (order) back.set('order', order);
    if (topic) back.set('topic', topic);
    redirect(storePath(store, `/customer-service/contact?${back}`));
  }
  redirect(storePath(store, `/customer-service/cases/${created.id}?done=opened`));
}

/** Run a write on one of the shopper's own cases in this store, then back to it. */
async function onMyCase(caseId: string, done: string, write: (client: Awaited<ReturnType<typeof db>>, id: string) => Promise<unknown>): Promise<void> {
  const store = await getMarketplace();
  const id = String(caseId);
  const page = `/customer-service/cases/${encodeURIComponent(id)}`;
  const user = await readUser();
  if (!user) redirect(storePath(store, `/signin?next=${encodeURIComponent(page)}`));
  const client = await db();
  let code = '';
  try {
    // yours, in this store (an admin answers from /admin/support)
    if (!(await getCase(client, store.id, id, user.id))) throw new DataError('case_not_found');
    await write(client, id);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code === 'invalid_input' ? 'invalid_reply' : err.code;
  }
  redirect(storePath(store, `${page}?${code ? `error=${encodeURIComponent(code)}` : `done=${done}`}`));
}

/** Reply on your case, bound to its id. */
export async function replyCaseAction(caseId: string, formData: FormData): Promise<void> {
  await onMyCase(caseId, 'replied', (client, id) => replyToCase(client, id, formData.get('body')));
}

/** Close your case, bound to its id. */
export async function closeCaseAction(caseId: string): Promise<void> {
  await onMyCase(caseId, 'closed', (client, id) => closeCase(client, id));
}
