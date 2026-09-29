import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

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
 */
export async function refreshSession(req: NextRequest): Promise<CookieToSet[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  if (!req.cookies.getAll().some((c) => c.name.startsWith('sb-'))) return [];
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
  await supabase.auth.getUser();
  return rotated;
}
