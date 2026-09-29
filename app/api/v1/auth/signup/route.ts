import type { NextRequest } from 'next/server';
import { body, errorResponse, json, preflight } from '@/lib/api/http';
import { authClient, tokenBody } from '@/lib/api/auth';
import { createAccount } from '@/lib/data/account';
import { DataError } from '@/lib/data/errors';
import { nameFromEmail } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/v1/auth/signup { email, password, name? } → 201 with tokens.
 * The account is active at once (this demo store doesn't verify email addresses).
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const b = await body(req);
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (!email || !password) throw new DataError('invalid_input', 'email', 'email and password are required.');
    const name = typeof b.name === 'string' && b.name.trim() ? b.name : nameFromEmail(email);
    await createAccount(createAdminClient(), { email, password, name });
    const { data, error } = await authClient().auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new DataError('internal', error?.message);
    return json(tokenBody(data.session), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export const OPTIONS = preflight;
