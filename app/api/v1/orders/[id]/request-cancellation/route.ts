import { json, preflight, requireUser, route } from '@/lib/api/http';
import { requestCancellation } from '@/lib/data/orders';

/**
 * POST /api/v1/orders/:id/request-cancellation — ask for a shipped order to be stopped on its
 * way: until it's out for delivery it's sent back and cancelled (`cancelReason` 'intercepted';
 * stock returned, refunded as a cancel is). Not shipped yet, it's simply cancelled.
 * `order_not_cancellable` (409, detail: the stage) once it's out for delivery or delivered.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  return json({ order: await requestCancellation(ctx.db, id) });
});

export const OPTIONS = preflight;
