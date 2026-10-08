import 'server-only';
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseEnv } from '../supabase/config';
import { verifiedFactor, type FactorHolder } from '../two-step';
import { DataError } from './errors';

/**
 * Two-step verification through Supabase Auth's MFA endpoints, acting with the caller's access
 * token (the web session's or an API bearer token alike). See lib/two-step.ts.
 */

/** A session Supabase Auth issues once a code checks out (aal2). */
export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: { id: string; email?: string | null } & FactorHolder;
}

/** What setting up an authenticator app needs: the factor to confirm, its QR code (an SVG data URI), its secret and otpauth:// URI. */
export interface TwoStepSetup {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}

async function auth<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; data: T | null; message: string }> {
  assertSupabaseEnv();
  const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method: init.method ?? 'GET',
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => null)) as (T & { msg?: string; message?: string; error_description?: string }) | null;
  return { status: res.status, data: res.ok ? data : null, message: data?.msg ?? data?.message ?? data?.error_description ?? '' };
}

function failed(step: string, r: { status: number; message: string }): never {
  if (r.status === 401 || r.status === 403) throw new DataError('not_authenticated', step);
  throw new DataError('two_step_unavailable', step, r.message || undefined);
}

/** The QR code as an image URL: Supabase Auth sends an SVG data URI, or (some versions) the SVG itself. */
export function qrImage(qr: string): string {
  const svg = qr.trim();
  return svg.startsWith('<') ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : svg;
}

/** The caller as Supabase Auth sees them, factors included. */
async function authUser(token: string): Promise<{ id: string } & FactorHolder> {
  const r = await auth<{ id: string } & FactorHolder>(token, '/user');
  if (!r.data) failed('user', r);
  return r.data;
}

/** Whether two-step verification is on for the caller. */
export async function twoStepOn(token: string): Promise<boolean> {
  return verifiedFactor(await authUser(token)) != null;
}

/**
 * Start setting up an authenticator app: drops any set-up left unfinished, then enrols a new one
 * to confirm with a code (confirmTwoStep). `two_step_unavailable` when it's already on, or the
 * project doesn't allow authenticator apps.
 */
export async function enrollTwoStep(token: string): Promise<TwoStepSetup> {
  const user = await authUser(token);
  if (verifiedFactor(user)) throw new DataError('two_step_on');
  for (const f of user.factors ?? []) {
    if (f.status !== 'verified') await auth(token, `/factors/${encodeURIComponent(f.id)}`, { method: 'DELETE' });
  }
  const r = await auth<{ id: string; totp: { qr_code: string; secret: string; uri: string } }>(token, '/factors', { method: 'POST', body: { factor_type: 'totp' } });
  if (!r.data) failed('enroll', r);
  return { factorId: r.data.id, qrCode: qrImage(r.data.totp.qr_code), secret: r.data.totp.secret, uri: r.data.totp.uri };
}

/**
 * Check a code against a factor (a new one being confirmed, or the one signed in with): a fresh
 * aal2 session when it's right; `invalid_input` (`code`) when it isn't, or has expired.
 */
export async function confirmTwoStep(token: string, factorId: string, code: string): Promise<AuthSession> {
  const id = encodeURIComponent(factorId);
  const challenge = await auth<{ id: string }>(token, `/factors/${id}/challenge`, { method: 'POST', body: {} });
  if (!challenge.data) {
    if (challenge.status === 404 || challenge.status === 422) throw new DataError('invalid_input', 'factor', 'Start setting up two-step verification again.');
    failed('challenge', challenge);
  }
  const verified = await auth<AuthSession>(token, `/factors/${id}/verify`, { method: 'POST', body: { challenge_id: challenge.data.id, code } });
  if (!verified.data) {
    if (verified.status === 400 || verified.status === 422) throw new DataError('invalid_input', 'code', 'That code didn’t work. Enter the 6-digit code your authenticator app shows now.');
    failed('verify', verified);
  }
  return verified.data;
}

/** The second step of a sign-in: the code from the caller's authenticator app → an aal2 session. */
export async function verifySecondStep(token: string, code: string): Promise<AuthSession> {
  const factor = verifiedFactor(await authUser(token));
  if (!factor) throw new DataError('two_step_off');
  return confirmTwoStep(token, factor.id, code);
}

/** Turn two-step verification off (the session must have passed it: aal2). Off already is fine. */
export async function turnOffTwoStep(token: string): Promise<void> {
  const user = await authUser(token);
  for (const f of user.factors ?? []) {
    const r = await auth(token, `/factors/${encodeURIComponent(f.id)}`, { method: 'DELETE' });
    if (r.status >= 400 && r.status !== 404) failed('unenroll', r);
  }
}
