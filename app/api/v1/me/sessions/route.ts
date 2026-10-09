import { accessToken, noContent, preflight, requireUser, route } from '@/lib/api/http';
import { signOutElsewhere } from '@/lib/data/account';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * DELETE /api/v1/me/sessions — "Sign out everywhere": `204`. Every other session of the account
 * ends (other browsers, devices and API tokens); the caller's tokens keep working.
 */
export const DELETE = route(async (ctx) => {
  requireUser(ctx);
  await signOutElsewhere(createAdminClient(), await accessToken(ctx));
  return noContent();
});

export const OPTIONS = preflight;
