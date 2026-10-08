import 'server-only';
import { cache } from 'react';
import { isAdmin } from './data/admin-catalog';
import { db } from './supabase/server';
import { owesSecondStep, verifiedFactor } from './two-step';

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

/**
 * The session's user (verified with Supabase Auth) and whether it still owes the second step of
 * two-step verification. Once per request.
 */
const readSession = cache(async (): Promise<{ user: SessionUser; pending: boolean; twoStep: boolean } | null> => {
  const client = await db();
  const { data } = await client.auth.getUser();
  const user = data.user;
  if (!user || !user.email) return null;
  const metaName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '';
  const pending = owesSecondStep(user, (await client.auth.getSession()).data.session?.access_token);
  return { user: { id: user.id, name: metaName || nameFromEmail(user.email), email: user.email }, pending, twoStep: verifiedFactor(user) != null };
});

/** The signed-in user, or null: also null while they still owe the code of two-step verification. */
export const readUser = cache(async (): Promise<SessionUser | null> => {
  const s = await readSession();
  return s && !s.pending ? s.user : null;
});

/** Someone who signed in with their password and still owes the code from their authenticator app, or null. */
export const readSecondStep = cache(async (): Promise<SessionUser | null> => {
  const s = await readSession();
  return s?.pending ? s.user : null;
});

/** Whether the signed-in user is a store admin (public.admins). Once per request; false for guests. */
export const readIsAdmin = cache(async (): Promise<boolean> => ((await readUser()) ? isAdmin(await db()) : false));

export function firstName(user: SessionUser): string {
  return user.name.split(' ')[0] || user.name;
}

/** Whether the signed-in user has two-step verification on. */
export const readTwoStepOn = cache(async (): Promise<boolean> => !!(await readSession())?.twoStep);
