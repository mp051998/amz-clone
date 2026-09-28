import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/database.types';
import type { Db } from '@/lib/db/client';

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export const anon = (): Db => createClient<Database>(url(), anonKey(), opts);
export const admin = () => createClient<Database>(url(), process.env.SUPABASE_SERVICE_ROLE_KEY!, opts);

export interface TestUser {
  id: string;
  email: string;
  db: Db;
}

/** A confirmed account plus a client signed in as it. */
export async function newUser(name = 'Test Shopper'): Promise<TestUser> {
  const email = `t-${crypto.randomUUID().slice(0, 12)}@example.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error || !data.user) throw error ?? new Error('createUser failed');
  const db = anon();
  const signIn = await db.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, db };
}

export async function deleteUser(u: TestUser | undefined): Promise<void> {
  if (u) await admin().auth.admin.deleteUser(u.id);
}

/** A product to shop with: in stock, in the given market, not used by other tests. */
export async function pickProduct(market: 'US' | 'IN', offset = 0): Promise<{ id: string; price_minor: number; stock: number }> {
  const { data, error } = await admin()
    .from('products')
    .select('id, price_minor, stock')
    .eq('market_id', market)
    .gte('stock', 25)
    .order('id')
    .range(offset, offset);
  if (error || !data?.[0]) throw error ?? new Error('no product');
  return data[0];
}

export async function setStock(id: string, stock: number): Promise<void> {
  const { error } = await admin().from('products').update({ stock }).eq('id', id);
  if (error) throw error;
}

export async function stockOf(id: string): Promise<number> {
  const { data, error } = await admin().from('products').select('stock').eq('id', id).single();
  if (error) throw error;
  return data.stock;
}

export const US_SHIPPING = {
  fullName: 'Alex Morgan',
  phone: '2065550123',
  line1: '410 Terry Ave N',
  city: 'Seattle',
  state: 'WA',
  postcode: '98109',
};

export const IN_SHIPPING = {
  fullName: 'Aarav Sharma',
  phone: '9876543210',
  line1: '12, Prestige Residency',
  line2: 'Koramangala 4th Block',
  city: 'Bengaluru',
  state: 'Karnataka',
  postcode: '560034',
};
