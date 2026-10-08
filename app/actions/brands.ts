'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { followBrand, unfollowBrand } from '@/lib/data/brand-follows';
import { DataError } from '@/lib/data/errors';
import { storePath } from '@/lib/marketplace';
import { safeNext } from '@/lib/safe-next';
import { getMarket } from '@/lib/session';
import { db } from '@/lib/supabase/server';

/**
 * "Follow" (`follow=1`) or unfollow a brand (`brand`) in this store, then back to `next` (a path
 * without the store prefix), with `follow_error` when it couldn't. Signed out: sign in first.
 */
export async function setBrandFollowed(formData: FormData): Promise<void> {
  const market = await getMarket();
  const sp = (path: string) => storePath({ id: market }, path);
  const next = safeNext(String(formData.get('next') ?? '/account/brands'));
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(next)}`));
  let code: string | null = null;
  try {
    const client = await db();
    if (formData.get('follow') === '1') await followBrand(client, market, formData.get('brand'));
    else await unfollowBrand(client, market, formData.get('brand'));
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  revalidatePath('/', 'layout');
  redirect(sp(code ? `${next}${next.includes('?') ? '&' : '?'}follow_error=${code}` : next));
}
