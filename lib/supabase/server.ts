import 'server-only';
import { cache } from 'react';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/db/database.types';
import type { Db } from '@/lib/db/client';
import { SUPABASE_URL, SUPABASE_ANON_KEY, assertSupabaseEnv } from './config';

export type { Db };

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Binds to the request cookie jar so the signed-in session travels with every call
 * and row-level security sees the right user. `setAll` is a no-op during a Server
 * Component render (cookies are read-only there); the proxy refreshes the auth
 * cookies on navigation instead.
 */
export async function createClient(): Promise<Db> {
  assertSupabaseEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // called from a Server Component render — safe to ignore.
        }
      },
    },
  });
}

/** One cookie-bound client per request (React cache is request-scoped on the server). */
export const db = cache(createClient);

/**
 * A signed-out client that never touches the request: for work a Server Component schedules
 * with `after()`, which runs once the response is sent and can't read cookies any more.
 */
export function anonClient(): Db {
  assertSupabaseEnv();
  return createSupabaseClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
