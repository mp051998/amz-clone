import { existsSync } from 'node:fs';

// Load .env.local (Supabase URL + keys) without echoing anything.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('db tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (run `npx supabase start`).');
}
