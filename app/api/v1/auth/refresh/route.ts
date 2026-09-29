import type { NextRequest } from 'next/server';
import { body, errorResponse, json, preflight } from '@/lib/api/http';
import { authClient, tokenBody } from '@/lib/api/auth';
import { DataError } from '@/lib/data/errors';

/** POST /api/v1/auth/refresh { refreshToken } → a fresh token pair. */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const { refreshToken } = await body(req);
    if (typeof refreshToken !== 'string' || !refreshToken) throw new DataError('invalid_input', 'refreshToken', 'refreshToken is required.');
    const { data, error } = await authClient().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) throw new DataError('not_authenticated', undefined, 'Refresh token is invalid or expired.');
    return json(tokenBody(data.session));
  } catch (err) {
    return errorResponse(err);
  }
}

export const OPTIONS = preflight;
