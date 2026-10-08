import { json, preflight, requireUser, route } from '@/lib/api/http';
import { watchDeal } from '@/lib/data/deal-watches';

/**
 * POST /api/v1/deals/lightning/:id/watch — watch an upcoming Lightning Deal ("Watch this deal"):
 * when it goes live it's in the caller's messages. `409 deal_not_upcoming` once it has started or
 * ended. DELETE stops watching. Both return `{watching}`.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  return json({ watching: await watchDeal(ctx.db, id, true) });
});

export const DELETE = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  return json({ watching: await watchDeal(ctx.db, id, false) });
});

export const OPTIONS = preflight;
