import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { chooseReturnMethod } from '@/lib/data/returns';

/**
 * PUT /api/v1/returns/:id/method { method: dropoff | pickup, pickupPointId?, pickupOn? } — how your
 * open return goes back: dropped off (at a pickup point, or any) or picked up on a day.
 * `return_not_open` (409) once it's received, rejected or cancelled.
 */
export const PUT = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  return json({ return: await chooseReturnMethod(ctx.db, id, { method: b.method, pickupPointId: b.pickupPointId, pickupOn: b.pickupOn }) });
});

export const OPTIONS = preflight;
