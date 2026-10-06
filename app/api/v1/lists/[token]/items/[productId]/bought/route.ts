import { noContent, preflight, requireUser, route } from '@/lib/api/http';
import { markSharedGift } from '@/lib/data/collections';

type Params = { token: string; productId: string };

/** POST /api/v1/lists/:token/items/:productId/bought — mark an item on someone's shared list as bought by you. */
export const POST = route<Params>(async (ctx, { token, productId }) => {
  requireUser(ctx);
  await markSharedGift(ctx.db, token, productId, true);
  return noContent();
});

/** DELETE /api/v1/lists/:token/items/:productId/bought — undo your mark. */
export const DELETE = route<Params>(async (ctx, { token, productId }) => {
  requireUser(ctx);
  await markSharedGift(ctx.db, token, productId, false);
  return noContent();
});

export const OPTIONS = preflight;
