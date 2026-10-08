'use server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { parseIds, parseRecent, RECENT_COOKIE, RECENT_MAX_AGE, RECENT_PAUSED_COOKIE, RECS_SKIP_COOKIE, RECS_SKIP_MAX, RECS_SKIP_MAX_AGE } from '@/lib/recent-ids';

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

/**
 * "Don't use for recommendations" (`use=0`) on a product viewed or bought, or use it again
 * (`use=1`). Only the server reads the list.
 */
export async function setUseForRecommendations(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!parseIds(id, 1).length) return;
  const jar = await cookies();
  const rest = parseIds(jar.get(RECS_SKIP_COOKIE)?.value, RECS_SKIP_MAX).filter((x) => x !== id);
  const ids = formData.get('use') === '0' ? [id, ...rest].slice(0, RECS_SKIP_MAX) : rest;
  if (ids.length) jar.set(RECS_SKIP_COOKIE, ids.join(','), { path: '/', maxAge: RECS_SKIP_MAX_AGE, sameSite: 'lax', httpOnly: true });
  else jar.delete(RECS_SKIP_COOKIE);
  revalidatePath('/', 'layout');
}
