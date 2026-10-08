'use server';
import { revalidatePath } from 'next/cache';
import { readUser } from '@/lib/auth';
import { watchDeal } from '@/lib/data/deal-watches';
import { DataError } from '@/lib/data/errors';
import { db } from '@/lib/supabase/server';

export type WatchDealResult = { watching: boolean } | { error: string; message?: string };

/**
 * "Watch this deal" on an upcoming Lightning Deal, or stop watching it. Signed-out callers get
 * `not_authenticated`; a deal that has started or ended, `deal_not_upcoming`.
 */
export async function toggleWatchDeal(dealId: string, watch: boolean): Promise<WatchDealResult> {
  const user = await readUser();
  if (!user) return { error: 'not_authenticated' };
  try {
    const watching = await watchDeal(await db(), dealId, watch);
    revalidatePath('/', 'layout');
    return { watching };
  } catch (err) {
    if (err instanceof DataError) return { error: err.code, message: err.message };
    throw err;
  }
}
