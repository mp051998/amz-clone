import type { NextRequest } from 'next/server';
import { body, errorResponse, json, preflight } from '@/lib/api/http';
import { tokenBody } from '@/lib/api/auth';
import { DataError } from '@/lib/data/errors';
import { verifySecondStep } from '@/lib/data/two-step';
import { readCode } from '@/lib/two-step';

/**
 * POST /api/v1/auth/token/verify { code } with `Authorization: Bearer <token from /auth/token>` →
 * a fresh token pair: the second step of signing in with two-step verification on (the code from
 * the authenticator app). `422 invalid_input` (`code`) for a wrong or expired code.
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) throw new DataError('not_authenticated');
    const code = readCode((await body(req)).code);
    if (!code) throw new DataError('invalid_input', 'code', 'code must be the 6-digit code from the authenticator app.');
    return json(tokenBody(await verifySecondStep(token, code)));
  } catch (err) {
    return errorResponse(err);
  }
}

export const OPTIONS = preflight;
