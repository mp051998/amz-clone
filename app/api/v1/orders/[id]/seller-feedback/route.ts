import { body, json, noContent, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { getOrder } from '@/lib/data/orders';
import { leaveSellerFeedback, orderFeedback, removeSellerFeedback } from '@/lib/data/seller-feedback';

const sellerOf = (v: unknown): string => {
  if (typeof v !== 'string' || !v.trim()) throw new DataError('invalid_input', 'seller', 'Send the seller to rate.');
  return v;
};

/** GET /api/v1/orders/:id/seller-feedback — the caller's ratings of the order's sellers. */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  if (!(await getOrder(ctx.db, id))) throw new DataError('order_not_found');
  return json({ feedback: [...(await orderFeedback(ctx.db, id)).values()] });
});

/**
 * PUT /api/v1/orders/:id/seller-feedback { seller, rating, arrivedOnTime?, asDescribed?, comment? } —
 * rate a seller in the order, or change the rating: once it's delivered, for 90 days (`409
 * feedback_not_open` otherwise).
 */
export const PUT = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  for (const k of ['arrivedOnTime', 'asDescribed'] as const) {
    if (b[k] !== undefined && b[k] !== null && typeof b[k] !== 'boolean') throw new DataError('invalid_input', k, `${k} must be true, false or null.`);
  }
  const feedback = await leaveSellerFeedback(ctx.db, id, sellerOf(b.seller), {
    rating: b.rating,
    arrivedOnTime: b.arrivedOnTime,
    asDescribed: b.asDescribed,
    comment: b.comment,
  });
  return json({ feedback });
});

/** DELETE /api/v1/orders/:id/seller-feedback { seller } — remove the caller's rating: `204`. */
export const DELETE = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  await removeSellerFeedback(ctx.db, id, sellerOf(b.seller));
  return noContent();
});

export const OPTIONS = preflight;
