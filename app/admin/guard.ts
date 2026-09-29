import 'server-only';
import { redirect } from 'next/navigation';
import { readIsAdmin, readUser, type SessionUser } from '@/lib/auth';
import type { PublicMarketplace } from '@/lib/contracts';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

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
