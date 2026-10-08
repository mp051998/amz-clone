import { body, noContent, preflight, requireUser, route } from '@/lib/api/http';
import { markSharedGift, setSharedGift } from '@/lib/data/collections';

type Params = { token: string; productId: string };

/**
 * POST /api/v1/lists/:token/items/:productId/bought { quantity? } — mark an item on someone's
 * shared list as bought by you: `quantity` of it, or all that's still needed.
 */
export const POST = route<Params>(async (ctx, { token, productId }) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  if (b.quantity === undefined) await markSharedGift(ctx.db, token, productId, true);
  else await setSharedGift(ctx.db, token, productId, b.quantity);
  return noContent();
});

/** DELETE /api/v1/lists/:token/items/:productId/bought — undo your mark. */
export const DELETE = route<Params>(async (ctx, { token, productId }) => {
  requireUser(ctx);
  await markSharedGift(ctx.db, token, productId, false);
  return noContent();
});

export const OPTIONS = preflight;
