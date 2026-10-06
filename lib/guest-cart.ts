import 'server-only';
import { mergeGuestCart } from './data/cart';
import { clearGuestToken, readGuestToken } from './session';
import { db } from './supabase/server';

/**
 * Fold the guest cart (all stores) into the account that just signed in, whichever way
 * the session was opened (password form, emailed link). Server Actions / Route Handlers only.
 */
export async function adoptGuestCart(): Promise<void> {
  const token = await readGuestToken();
  if (!token) return;
  try {
    await mergeGuestCart(await db(), token);
  } catch (err) {
    console.error('[auth] guest cart merge failed', err);
    return; // keep the cookie so a later sign-in can retry
  }
  await clearGuestToken();
}
