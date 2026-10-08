import { tokenBody } from '@/lib/api/auth';
import { accessToken, body, json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { confirmTwoStep } from '@/lib/data/two-step';
import { readCode } from '@/lib/two-step';

/**
 * POST /api/v1/me/two-step/verify { factorId, code } → `{on: true, ...token pair}`: finishes turning
 * on two-step verification with the code the authenticator app shows. Use the new tokens from
 * here on: the old ones only passed the password, so they're refused (`two_step_required`).
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const { factorId, code } = await body(ctx.req);
  if (typeof factorId !== 'string' || !factorId) throw new DataError('invalid_input', 'factorId', 'factorId is required.');
  const digits = readCode(code);
  if (!digits) throw new DataError('invalid_input', 'code', 'code must be the 6-digit code from the authenticator app.');
  return json({ on: true, ...tokenBody(await confirmTwoStep(await accessToken(ctx), factorId, digits)) });
});

export const OPTIONS = preflight;
