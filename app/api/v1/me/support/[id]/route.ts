import { json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { getCase } from '@/lib/data/support';

/** GET /api/v1/me/support/:id — one of the caller's cases with its messages, oldest first. */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  const user = requireUser(ctx);
  const thread = await getCase(ctx.db, ctx.market, id, user.id);
  if (!thread) throw new DataError('case_not_found');
  return json({ case: thread });
});

export const OPTIONS = preflight;
