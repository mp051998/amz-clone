'use server';
import { redirect } from 'next/navigation';
import { DataError } from '@/lib/data/errors';
import { assertStoreCase, closeCase, replyToCase } from '@/lib/data/support';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { adminClient } from '../guard';

/** A write on one of this store's cases as an admin (checked on every call), then back to the case. */
async function onCase(caseId: string, done: string, write: (client: Awaited<ReturnType<typeof adminClient>>['client'], id: string) => Promise<unknown>): Promise<void> {
  const store = await getMarketplace();
  const id = String(caseId);
  const back = (qs: string) => storePath(store, `/admin/support/${encodeURIComponent(id)}?${qs}`);
  const { client, error } = await adminClient();
  if (error) redirect(back('error=forbidden'));
  let code = '';
  try {
    await assertStoreCase(client, store.id, id);
    await write(client, id);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code === 'invalid_input' ? 'invalid_reply' : err.code;
  }
  redirect(back(code ? `error=${encodeURIComponent(code)}` : `done=${done}`));
}

/** Answer a case as the store, bound to its id: it moves to "Answered". */
export async function replyAsStoreAction(caseId: string, formData: FormData): Promise<void> {
  await onCase(caseId, 'replied', (client, id) => replyToCase(client, id, formData.get('body')));
}

/** Close a case, bound to its id. */
export async function closeAsStoreAction(caseId: string): Promise<void> {
  await onCase(caseId, 'closed', (client, id) => closeCase(client, id));
}
