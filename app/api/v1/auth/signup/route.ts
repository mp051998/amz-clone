import type { NextRequest } from 'next/server';
import { body, errorResponse, json, preflight } from '@/lib/api/http';
import { authClient, tokenBody } from '@/lib/api/auth';
import { DataError } from '@/lib/data/errors';
import { nameFromEmail } from '@/lib/auth';

/**
 * POST /api/v1/auth/signup { email, password, name? }
 * 201 with tokens when the account is active immediately; 202 when the project
 * requires email confirmation first.
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const b = await body(req);
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
    if (!email || !password) throw new DataError('invalid_input', 'email', 'email and password are required.');
    const { data, error } = await authClient().auth.signUp({
      email,
      password,
      options: { data: { full_name: name || nameFromEmail(email) } },
    });
    if (error) {
      const m = error.message.toLowerCase();
      if (/already|registered/.test(m)) throw new DataError('duplicate', 'email', 'An account with that email already exists.');
      if (/password/.test(m)) throw new DataError('invalid_input', 'password', error.message);
      throw new DataError('invalid_input', undefined, error.message);
    }
    if (!data.session) return json({ confirmationRequired: true, user: data.user ? { id: data.user.id, email: data.user.email } : null }, { status: 202 });
    return json(tokenBody(data.session), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export const OPTIONS = preflight;
