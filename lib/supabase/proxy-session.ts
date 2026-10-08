import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
import { owesSecondStep } from '../two-step';

export interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Refresh the Supabase auth session before the request is handled. Rotated auth
 * cookies are written onto the request (so this render already sees the fresh
 * session) and returned for the caller to set on the response. Without this the
 * access token would silently expire and the user would appear logged out.
 * Skipped for visitors with no auth cookie.
 *
 * `owesSecondStep`: the session is only a first step (a password, with two-step verification on),
 * so the caller keeps it on the code page.
 */
export async function refreshSession(req: NextRequest): Promise<{ rotated: CookieToSet[]; owesSecondStep: boolean }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { rotated: [], owesSecondStep: false };
  if (!req.cookies.getAll().some((c) => c.name.startsWith('sb-'))) return { rotated: [], owesSecondStep: false };
  const rotated: CookieToSet[] = [];
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach((c) => {
          req.cookies.set(c.name, c.value);
          rotated.push(c);
        });
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  // the user is verified (factors and all); the token it was checked with says how far they got
  const pending = data.user ? owesSecondStep(data.user, (await supabase.auth.getSession()).data.session?.access_token) : false;
  return { rotated, owesSecondStep: pending };
}
