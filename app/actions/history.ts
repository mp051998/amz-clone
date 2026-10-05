'use server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { parseRecent, RECENT_COOKIE, RECENT_MAX_AGE, RECENT_PAUSED_COOKIE } from '@/lib/recent-ids';

// The product page writes these from the browser, so they can't be httpOnly.
const OPTIONS = { path: '/', maxAge: RECENT_MAX_AGE, sameSite: 'lax', httpOnly: false } as const;

async function writeIds(ids: string[]): Promise<void> {
  const jar = await cookies();
  if (ids.length) jar.set(RECENT_COOKIE, ids.join(','), OPTIONS);
  else jar.delete(RECENT_COOKIE);
  revalidatePath('/', 'layout');
}

/** "Remove from view": drops one product (`id`) from the browsing history. */
export async function removeFromHistory(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const jar = await cookies();
  await writeIds(parseRecent(jar.get(RECENT_COOKIE)?.value).filter((x) => x !== id));
}

/** Forgets every product viewed, in both stores. */
export async function clearHistory(): Promise<void> {
  await writeIds([]);
}

/** Pause (`paused=1`) or resume recording views. Pausing keeps the list; clear it separately. */
export async function setHistoryPaused(formData: FormData): Promise<void> {
  const jar = await cookies();
  if (formData.get('paused') === '1') jar.set(RECENT_PAUSED_COOKIE, '1', { ...OPTIONS, maxAge: 60 * 60 * 24 * 365 });
  else jar.delete(RECENT_PAUSED_COOKIE);
  revalidatePath('/', 'layout');
}
