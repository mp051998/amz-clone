import 'server-only';
import { redirect } from 'next/navigation';
import { readIsAdmin, readUser, type SessionUser } from '@/lib/auth';
import type { PublicMarketplace } from '@/lib/contracts';
import { isAdmin } from '@/lib/data/admin-catalog';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';

export interface AdminContext {
  store: PublicMarketplace;
  user: SessionUser;
  /** false: signed in, but not in public.admins — pages show "Admins only". */
  admin: boolean;
}

/**
 * Page-level gate for /admin: guests go to sign-in (and come back to `next`). This only decides
 * what to render; every action re-checks, and the database enforces the writes (RLS).
 */
export async function adminPage(next: string): Promise<AdminContext> {
  const store = await getMarketplace();
  const user = await readUser();
  if (!user) redirect(storePath(store, `/signin?next=${encodeURIComponent(next)}`));
  return { store, user, admin: await readIsAdmin() };
}

/**
 * For server actions: the caller's client once they're signed in and an admin, checked on every
 * call (a form on an admin page is not a security boundary), else the message to show.
 */
export async function adminClient() {
  const client = await db();
  const { data } = await client.auth.getUser();
  if (!data.user) return { client, error: 'Your session ended. Sign in again to continue.' };
  if (!(await isAdmin(client))) return { client, error: 'Only store admins can change the catalogue.' };
  return { client, error: null };
}
