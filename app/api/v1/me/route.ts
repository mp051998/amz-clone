import { accessToken, body, json, preflight, requireUser, route, type ApiContext } from '@/lib/api/http';
import { changeEmail, changePassword, renameAccount, validEmail, validName, validPassword } from '@/lib/data/account';
import { DataError, unwrap } from '@/lib/data/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { tokenBody } from '@/lib/api/auth';

async function me(ctx: ApiContext, id: string, email: string | null) {
  const profile = unwrap(await ctx.db.from('profiles').select('display_name, created_at').eq('id', id).maybeSingle());
  return { id, email, name: profile?.display_name ?? null, createdAt: profile?.created_at ?? null };
}

/** GET /api/v1/me — the authenticated caller and their profile. */
export const GET = route(async (ctx) => {
  const user = requireUser(ctx);
  return json({ user: await me(ctx, user.id, user.email) });
});

/**
 * PATCH /api/v1/me { name?, email?, newPassword?, currentPassword? }
 * Changing the email or password takes `currentPassword`. A new password ends every session
 * of the account, the caller's too, so the response carries a new `session` (tokens).
 */
export const PATCH = route(async (ctx) => {
  const user = requireUser(ctx);
  if (!user.email) throw new DataError('forbidden');
  const b = await body(ctx.req);
  if (b.name === undefined && b.email === undefined && b.newPassword === undefined) {
    throw new DataError('invalid_input', undefined, 'Send name, email or newPassword.');
  }
  // check every field before changing any
  if (b.name !== undefined) validName(b.name);
  if (b.email !== undefined) validEmail(b.email);
  if (b.newPassword !== undefined) validPassword(b.newPassword);

  const service = createAdminClient();
  let account = { id: user.id, email: user.email };
  if (b.name !== undefined) await renameAccount(service, ctx.db, user.id, b.name);
  if (b.email !== undefined) {
    account = { ...account, email: await changeEmail(service, account, { email: b.email, currentPassword: b.currentPassword }) };
  }
  if (b.newPassword !== undefined) {
    const session = await changePassword(service, account, {
      newPassword: b.newPassword,
      currentPassword: b.currentPassword,
      recovering: false,
      accessToken: await accessToken(ctx),
    });
    // the old tokens are dead: hand back new ones
    return json({ user: await me(ctx, user.id, account.email), session: tokenBody(session) });
  }
  return json({ user: await me(ctx, user.id, account.email) });
});

export const OPTIONS = preflight;
