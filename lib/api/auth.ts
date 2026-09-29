import 'server-only';
import { createClient, type Session } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseEnv } from '../supabase/config';

/** A throwaway anon client for token endpoints — never persists or shares a session. */
export function authClient() {
  assertSupabaseEnv();
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** The token response every auth endpoint returns. */
export function tokenBody(session: Session) {
  return {
    tokenType: 'bearer',
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    expiresIn: session.expires_in,
    user: { id: session.user.id, email: session.user.email ?? null },
  };
}
