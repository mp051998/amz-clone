import 'server-only';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { savedProductIds } from '@/lib/data/collections';
import type { Market } from '@/lib/types';

/**
 * Ids the signed-in viewer has saved in this store, for SaveButton's initial state. Signed-out viewers
 * (or a database without the collections tables yet) get an empty set — the button still works.
 */
export async function viewerSavedIds(market: Market): Promise<Set<string>> {
  try {
    if (!(await readUser())) return new Set();
    return await savedProductIds(await db(), market);
  } catch {
    return new Set();
  }
}
