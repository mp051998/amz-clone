import 'server-only';
import { cache } from 'react';
import { isAdmin } from './data/admin-catalog';
import { db } from './supabase/server';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/** derive a display name from an email local-part (e.g. alex.morgan@x.com → Alex Morgan). */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || 'there';
  const words = local.split(/[._-]+/).filter(Boolean);
  const titled = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return titled || 'there';
}

/** The signed-in user (verified with Supabase Auth), or null. Once per request. */
export const readUser = cache(async (): Promise<SessionUser | null> => {
  const { data } = await (await db()).auth.getUser();
  const user = data.user;
  if (!user || !user.email) return null;
  const metaName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '';
  return { id: user.id, name: metaName || nameFromEmail(user.email), email: user.email };
});

/** Whether the signed-in user is a store admin (public.admins). Once per request; false for guests. */
export const readIsAdmin = cache(async (): Promise<boolean> => ((await readUser()) ? isAdmin(await db()) : false));

export function firstName(user: SessionUser): string {
  return user.name.split(' ')[0] || user.name;
}
