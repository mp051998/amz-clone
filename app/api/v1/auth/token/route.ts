import type { NextRequest } from 'next/server';
import { body, errorResponse, json, preflight } from '@/lib/api/http';
import { authClient, tokenBody } from '@/lib/api/auth';
import { DataError } from '@/lib/data/errors';

/**
 * POST /api/v1/auth/token { email, password } → { accessToken, refreshToken, expiresAt, user }
 * Send the access token as `Authorization: Bearer …` on every other call.
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const { email, password } = await body(req);
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      throw new DataError('invalid_input', 'email', 'email and password are required.');
    }
    const { data, error } = await authClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error || !data.session) throw new DataError('not_authenticated', undefined, 'Incorrect email or password.');
    return json(tokenBody(data.session));
  } catch (err) {
    return errorResponse(err);
  }
}

export const OPTIONS = preflight;
