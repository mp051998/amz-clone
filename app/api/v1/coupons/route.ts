import { json, preflight, route } from '@/lib/api/http';
import { listCouponOffers } from '@/lib/data/coupons';

/**
 * GET /api/v1/coupons — every coupon in this store on a product on sale, biggest percent first:
 * `{market, items: [{product, percentOff, clipped}]}` (`clipped` is always false signed out).
 */
export const GET = route(async (ctx) =>
  json({ market: ctx.market, items: await listCouponOffers(ctx.db, ctx.market, ctx.user != null) }),
);

export const OPTIONS = preflight;
