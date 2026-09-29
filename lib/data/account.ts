import 'server-only';
import type { AuthError, Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/database.types';
import type { Db } from '@/lib/db/client';
import { authClient } from '@/lib/api/auth';
import { DataError } from './errors';

/**
 * Account changes: sign-up, name, email, password. Changes to the auth user go through
 * the service-role admin API once the caller is verified (it works the same for cookie
 * sessions and API bearer tokens). This demo store doesn't verify email addresses:
 * accounts are active at once and an email change applies immediately, but changing the
 * email or password takes the current password.
 */

type Service = SupabaseClient<Database>;

export const PASSWORD_MIN = 6;
const PASSWORD_MAX = 72; // bcrypt ignores the rest
const NAME_MAX = 80;
/** How long after opening a password-reset link the new password can be set without the old one. */
export const RECOVERY_WINDOW_S = 15 * 60;

export function validName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!name) throw new DataError('invalid_input', 'name', 'Enter your name.');
  if (name.length > NAME_MAX) throw new DataError('invalid_input', 'name', `Keep your name under ${NAME_MAX} characters.`);
  return name;
}

export function validEmail(raw: unknown): string {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new DataError('invalid_input', 'email', 'Enter a valid email address.');
  }
  return email;
}

export function validPassword(raw: unknown): string {
  const pw = typeof raw === 'string' ? raw : '';
  if (pw.length < PASSWORD_MIN) throw new DataError('invalid_input', 'password', `Use at least ${PASSWORD_MIN} characters.`);
  if (pw.length > PASSWORD_MAX) throw new DataError('invalid_input', 'password', `Use at most ${PASSWORD_MAX} characters.`);
  return pw;
}

function fromAuth(error: AuthError, field: 'email' | 'password'): DataError {
  switch (error.code) {
    case 'email_exists':
    case 'user_already_exists':
      return new DataError('duplicate', 'email', 'An account already exists for that email.');
    case 'email_address_invalid':
      return new DataError('invalid_input', 'email', 'Enter a valid email address.');
    case 'weak_password':
      return new DataError('invalid_input', 'password', error.message);
    case 'same_password':
      return new DataError('invalid_input', 'password', 'Pick a password you haven’t used for this account.');
  }
  return new DataError('internal', `${field}: ${error.code ?? ''} ${error.message}`, 'Something went wrong. Please try again.');
}

/** A new account that can sign in straight away. */
export async function createAccount(service: Service, input: { email: unknown; password: unknown; name: unknown }): Promise<{ id: string; email: string }> {
  const email = validEmail(input.email);
  const password = validPassword(input.password);
  const name = typeof input.name === 'string' && input.name.trim() ? validName(input.name) : null;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: name ? { full_name: name } : {},
  });
  if (error || !data.user) throw error ? fromAuth(error, 'email') : new DataError('internal');
  return { id: data.user.id, email };
}

/** Whether `password` is the account's current password. Leaves no session behind. */
export async function checkPassword(email: string, password: unknown): Promise<boolean> {
  if (typeof password !== 'string' || !password) return false;
  const client = authClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return false;
  await client.auth.signOut({ scope: 'local' });
  return true;
}

async function requirePassword(email: string, password: unknown): Promise<void> {
  if (!(await checkPassword(email, password))) {
    throw new DataError('invalid_input', 'currentPassword', 'That isn’t your current password.');
  }
}

/** Rename: the display name on the account and on the profile (reviews, orders). */
export async function renameAccount(service: Service, db: Db, userId: string, raw: unknown): Promise<string> {
  const name = validName(raw);
  const { error } = await service.auth.admin.updateUserById(userId, { user_metadata: { full_name: name } });
  if (error) throw new DataError('internal', error.message);
  const res = await db.from('profiles').update({ display_name: name }).eq('id', userId);
  if (res.error) throw new DataError('internal', res.error.message);
  return name;
}

export async function changeEmail(
  service: Service,
  user: { id: string; email: string },
  input: { email: unknown; currentPassword: unknown },
): Promise<string> {
  const email = validEmail(input.email);
  if (email === user.email) return email;
  await requirePassword(user.email, input.currentPassword);
  // the admin API answers a taken address with a bare 500; PGRST202: not migrated yet
  const taken = await service.rpc('email_in_use', { p_email: email });
  if (taken.data === true) throw new DataError('duplicate', 'email', 'An account already exists for that email.');
  if (taken.error && taken.error.code !== 'PGRST202') throw new DataError('internal', taken.error.message);
  const { error } = await service.auth.admin.updateUserById(user.id, { email, email_confirm: true });
  if (error) throw fromAuth(error, 'email');
  return email;
}

/**
 * Set a new password. Takes the current one, unless the session came from a password-reset
 * link opened moments ago ({@link isRecovery}). Every session of the account ends, so whoever
 * knew the old password is signed out everywhere; the caller gets a fresh session back.
 */
export async function changePassword(
  service: Service,
  user: { id: string; email: string },
  input: { newPassword: unknown; currentPassword?: unknown; recovering: boolean; accessToken: string },
): Promise<Session> {
  const password = validPassword(input.newPassword);
  if (!input.recovering) await requirePassword(user.email, input.currentPassword);
  const { error } = await service.auth.admin.updateUserById(user.id, { password });
  if (error) throw fromAuth(error, 'password');
  // Auth already ends the sessions on a password change; make sure of it (errors: already gone)
  await service.auth.admin.signOut(input.accessToken, 'global');
  const { data, error: signInError } = await authClient().auth.signInWithPassword({ email: user.email, password });
  if (signInError || !data.session) throw new DataError('internal', signInError?.message);
  return data.session;
}

// GoTrue records a session opened from an emailed link (reset, magic link) as `otp`.
const EMAIL_LINK = new Set(['otp', 'recovery', 'magiclink']);

/**
 * Whether a verified session was opened from an emailed link (a password reset) in the last
 * {@link RECOVERY_WINDOW_S} seconds: proof of the inbox stands in for the old password.
 */
export function isRecovery(claims: { amr?: unknown } | null | undefined, nowS = Date.now() / 1000): boolean {
  const amr: unknown[] = Array.isArray(claims?.amr) ? claims.amr : [];
  return amr.some((e) => {
    const { method, timestamp } = (e ?? {}) as { method?: unknown; timestamp?: unknown };
    return typeof method === 'string' && EMAIL_LINK.has(method) && typeof timestamp === 'number' && nowS - timestamp <= RECOVERY_WINDOW_S;
  });
}
