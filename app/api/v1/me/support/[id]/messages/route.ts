import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { getCase, replyToCase } from '@/lib/data/support';

/** POST /api/v1/me/support/:id/messages { body } — reply on your case; it goes back to waiting on the store. `201 {message}`. */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  const user = requireUser(ctx);
  if (!(await getCase(ctx.db, ctx.market, id, user.id))) throw new DataError('case_not_found');
  const b = await body(ctx.req);
  return json({ message: await replyToCase(ctx.db, id, b.body) }, { status: 201 });
});

export const OPTIONS = preflight;
