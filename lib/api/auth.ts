import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseEnv } from '../supabase/config';
import { owesSecondStep, type FactorHolder } from '../two-step';

/** A throwaway anon client for token endpoints — never persists or shares a session. */
export function authClient() {
  assertSupabaseEnv();
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** A session as Supabase Auth issues it. */
interface IssuedSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in: number;
  user: { id: string; email?: string | null } & FactorHolder;
}

/**
 * The token response every auth endpoint returns. `twoStepRequired`: the account has two-step
 * verification on and this token only passed the password; send the code to /auth/token/verify.
 */
export function tokenBody(session: IssuedSession) {
  return {
    tokenType: 'bearer',
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    expiresIn: session.expires_in,
    user: { id: session.user.id, email: session.user.email ?? null },
    twoStepRequired: owesSecondStep(session.user, session.access_token),
  };
}
