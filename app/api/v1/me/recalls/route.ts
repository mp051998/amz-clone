import { json, preflight, requireUser, route } from '@/lib/api/http';
import { myRecalls } from '@/lib/data/recalls';

/** GET /api/v1/me/recalls — recalls of products the caller bought in this store, each with the latest order it was on. */
export const GET = route(async (ctx) => {
  const user = requireUser(ctx);
  return json({ recalls: await myRecalls(ctx.db, ctx.market, user.id) });
});

export const OPTIONS = preflight;
