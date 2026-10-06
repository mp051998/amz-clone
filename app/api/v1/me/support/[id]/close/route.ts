import { json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { closeCase, getCase } from '@/lib/data/support';

/** POST /api/v1/me/support/:id/close — close your case (closing it twice is fine). */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  const user = requireUser(ctx);
  if (!(await getCase(ctx.db, ctx.market, id, user.id))) throw new DataError('case_not_found');
  return json({ case: await closeCase(ctx.db, id) });
});

export const OPTIONS = preflight;
