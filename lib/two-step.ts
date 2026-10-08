/**
 * Two-step verification (Login & security): an authenticator app's 6-digit codes, through
 * Supabase Auth's TOTP MFA. Once it's on, a password sign-in only opens a first-step (aal1)
 * session, which the app keeps on the code page (/signin/verify) and the database refuses
 * (20261229090000_two_step_verification.sql) until a code upgrades it to aal2.
 *
 * Pure helpers, safe in the proxy; the Auth calls are in lib/data/two-step.ts.
 */

/** A user as Supabase Auth returns it: just its factors. */
export interface FactorHolder {
  factors?: { id: string; factor_type?: string; status: string }[] | null;
}

/** The assurance level an access token was issued at (`aal1` after a password, `aal2` after a code); null if unreadable. */
export function tokenAal(accessToken: string | null | undefined): string | null {
  const payload = accessToken?.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as { aal?: unknown };
    return typeof claims.aal === 'string' ? claims.aal : null;
  } catch {
    return null;
  }
}

/** The user's verified authenticator app (TOTP factor), if two-step verification is on. */
export function verifiedFactor(user: FactorHolder | null | undefined): { id: string } | null {
  return user?.factors?.find((f) => f.status === 'verified' && (f.factor_type ?? 'totp') === 'totp') ?? null;
}

/** Whether a session still owes its second step: the user has two-step verification on and the token isn't aal2. */
export function owesSecondStep(user: FactorHolder | null | undefined, accessToken: string | null | undefined): boolean {
  return !!user?.factors?.some((f) => f.status === 'verified') && tokenAal(accessToken) !== 'aal2';
}

/** A code as typed ("123 456", "123-456") → its 6 digits, or null when it isn't one. */
export function readCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

/** The in-store path of the code page (the India store's under /in). */
export const VERIFY_PATH = '/signin/verify';

/** Paths a first-step session may still reach: the code page, emailed links, the API (which answers two_step_required itself). */
export function allowedBeforeSecondStep(pathname: string): boolean {
  const path = pathname.replace(/^\/in(?=\/|$)/, '') || '/';
  return path === VERIFY_PATH || path.startsWith('/auth/') || path.startsWith('/api/');
}
