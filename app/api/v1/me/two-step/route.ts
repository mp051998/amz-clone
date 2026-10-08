import { accessToken, body, json, preflight, requireUser, route } from '@/lib/api/http';
import { checkPassword } from '@/lib/data/account';
import { DataError } from '@/lib/data/errors';
import { enrollTwoStep, turnOffTwoStep, twoStepOn } from '@/lib/data/two-step';

/**
 * /api/v1/me/two-step — two-step verification (an authenticator app's codes).
 * GET → `{on}`. POST starts setting it up → `{factorId, qrCode, secret, uri}` (confirm with a code
 * at /me/two-step/verify); `409 two_step_on` when it's on. DELETE `{currentPassword}` turns it off
 * → `{on: false}`.
 */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  return json({ on: await twoStepOn(await accessToken(ctx)) });
});

export const POST = route(async (ctx) => {
  requireUser(ctx);
  return json(await enrollTwoStep(await accessToken(ctx)), { status: 201 });
});

export const DELETE = route(async (ctx) => {
  const user = requireUser(ctx);
  const { currentPassword } = await body(ctx.req);
  if (!user.email || !(await checkPassword(user.email, currentPassword))) {
    throw new DataError('invalid_input', 'currentPassword', 'That isn’t your current password.');
  }
  await turnOffTwoStep(await accessToken(ctx));
  return json({ on: false });
});

export const OPTIONS = preflight;
