import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/database.types';
import { SUPABASE_URL } from './config';

/**
 * Service-role client for the few trusted server-side writes that no customer
 * may perform (e.g. confirming a Stripe payment). Bypasses RLS — never import
 * this into client code, and never expose the key.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) {
    throw new Error('Server is missing SUPABASE_SERVICE_ROLE_KEY (see supabase/SETUP.md).');
  }
  return createClient<Database>(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
