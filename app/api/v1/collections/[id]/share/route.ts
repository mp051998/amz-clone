import { json, noContent, preflight, requireUser, route } from '@/lib/api/http';
import { shareCollection, unshareCollection } from '@/lib/data/collections';
import { storePath } from '@/lib/marketplace';

/** POST /api/v1/collections/:id/share — turn on the list's link (the same one if it's on already). */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const { token, sharedAt } = await shareCollection(ctx.db, id);
  return json({ token, sharedAt, url: `${ctx.req.nextUrl.origin}${storePath({ id: ctx.market }, `/lists/${token}`)}` });
});

/** DELETE /api/v1/collections/:id/share — turn the link off; it stops working. */
export const DELETE = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  await unshareCollection(ctx.db, id);
  return noContent();
});

export const OPTIONS = preflight;
