import { json, preflight, requireUser, route } from '@/lib/api/http';
import { unwrap } from '@/lib/data/errors';

/** GET /api/v1/me — the authenticated caller and their profile. */
export const GET = route(async (ctx) => {
  const user = requireUser(ctx);
  const profile = unwrap(await ctx.db.from('profiles').select('display_name, created_at').eq('id', user.id).maybeSingle());
  return json({ user: { id: user.id, email: user.email, name: profile?.display_name ?? null, createdAt: profile?.created_at ?? null } });
});

export const OPTIONS = preflight;
