import { json, preflight, requireUser, route } from '@/lib/api/http';
import { skipSubscription } from '@/lib/data/subscriptions';

/** POST /api/v1/me/subscriptions/:id/skip — skip the next delivery: `{subscription}` with its new `nextOn`. */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  return json({ subscription: await skipSubscription(ctx.db, id) });
});

export const OPTIONS = preflight;
