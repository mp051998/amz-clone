import { json, noContent, preflight, requireUser, route } from '@/lib/api/http';
import { clipCoupon, unclipCoupon } from '@/lib/data/coupons';

/**
 * POST /api/v1/products/:id/coupon — apply the product's coupon for the caller: `{coupon: {percentOff,
 * clipped: true}}`. While applied, its percent comes off every unit of the product in the cart and at
 * checkout. Applying again is a no-op; `404 coupon_not_found` when the product has none.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  return json({ coupon: await clipCoupon(ctx.db, id) });
});

/** DELETE /api/v1/products/:id/coupon — stop applying it (`204`). */
export const DELETE = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  await unclipCoupon(ctx.db, id);
  return noContent();
});

export const OPTIONS = preflight;
