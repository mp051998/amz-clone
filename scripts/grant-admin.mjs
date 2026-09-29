// Make a user a store admin (or revoke it): npm run admin:grant -- <email> [--revoke]
// Uses NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the env file npm passes in.
// Prints no keys.
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();
const revoke = args.includes('--revoke');
if (!email || !email.includes('@')) {
  console.error('usage: npm run admin:grant -- <email> [--revoke]');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// auth.admin has no lookup by email; scan pages (fine for a demo-sized user table)
let user = null;
for (let page = 1; !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email) ?? null;
  if (data.users.length < 200) break;
}
if (!user) {
  console.error(`No account for ${email}. Create it at /signin?new=1 first.`);
  process.exit(1);
}

const res = revoke
  ? await db.from('admins').delete().eq('user_id', user.id)
  : await db.from('admins').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
if (res.error) throw res.error;
console.log(`${revoke ? 'Revoked admin from' : 'Granted admin to'} ${email} on ${new URL(url).host}`);
