import { body, json, noContent, preflight, requireUser, route } from '@/lib/api/http';
import { deliveryFeedbackFor, leaveDeliveryFeedback, removeDeliveryFeedback } from '@/lib/data/delivery-feedback';
import { DataError } from '@/lib/data/errors';
import { getOrder } from '@/lib/data/orders';

/** GET /api/v1/orders/:id/delivery-feedback — the caller's feedback on the order's delivery, or null. */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  if (!(await getOrder(ctx.db, id))) throw new DataError('order_not_found');
  return json({ feedback: await deliveryFeedbackFor(ctx.db, id) });
});

/**
 * PUT /api/v1/orders/:id/delivery-feedback { positive, reasons?, comment? } — rate the delivery
 * (thumbs up or down, what went well or wrong), or change the rating: once it's delivered, for 30
 * days (`409 feedback_not_open` otherwise).
 */
export const PUT = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  if (typeof b.positive !== 'boolean') throw new DataError('invalid_input', 'positive', 'positive must be true or false.');
  const feedback = await leaveDeliveryFeedback(ctx.db, id, { positive: b.positive, reasons: b.reasons, comment: b.comment });
  return json({ feedback });
});

/** DELETE /api/v1/orders/:id/delivery-feedback — remove the caller's feedback: `204`. */
export const DELETE = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  await removeDeliveryFeedback(ctx.db, id);
  return noContent();
});

export const OPTIONS = preflight;
