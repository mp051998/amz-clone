'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { DataError } from '@/lib/data/errors';
import { setMessageTopic } from '@/lib/data/message-preferences';
import { storePath } from '@/lib/marketplace';
import { getMarket } from '@/lib/session';
import { db } from '@/lib/supabase/server';

const PAGE = '/account/communications';

/**
 * Turn a message topic (`topic`) on (`on=1`) or off, then back to Communication preferences with
 * `saved` (the topic), or `error` when it couldn't. Signed out: sign in first.
 */
export async function setMessageTopicOn(formData: FormData): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  if (!(await readUser())) redirect(sp(`/signin?next=${PAGE}`));
  const topic = formData.get('topic');
  let code: string | null = null;
  try {
    await setMessageTopic(await db(), topic, formData.get('on') === '1');
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  revalidatePath('/', 'layout');
  redirect(sp(code ? `${PAGE}?error=${code}` : `${PAGE}?saved=${encodeURIComponent(String(topic))}`));
}
