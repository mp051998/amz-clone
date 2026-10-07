import { json, preflight, route } from '@/lib/api/http';
import { listCouponOffers } from '@/lib/data/coupons';
import { activePromoCodes } from '@/lib/data/promo';

/**
 * GET /api/v1/coupons — every coupon in this store on a product on sale, biggest percent first:
 * `{market, items: [{product, percentOff, clipped}], promotions}` (`clipped` is always false
 * signed out), and the promotion codes the store is running.
 */
export const GET = route(async (ctx) => {
  const [items, promotions] = await Promise.all([listCouponOffers(ctx.db, ctx.market, ctx.user != null), activePromoCodes(ctx.db, ctx.market)]);
  return json({ market: ctx.market, items, promotions });
});

export const OPTIONS = preflight;
