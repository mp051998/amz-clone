import { json, preflight, route } from '@/lib/api/http';
import { getProduct, getProductInfo, getRatingSummary } from '@/lib/data/catalog';
import { protectionOffer } from '@/lib/data/cart';
import { couponFor } from '@/lib/data/coupons';
import { watchedDeals } from '@/lib/data/deal-watches';
import { DataError } from '@/lib/data/errors';
import { lightningDealsFor } from '@/lib/data/lightning-deals';
import { categoryReturnDays } from '@/lib/data/return-policy';
import { returnSignal } from '@/lib/data/return-signal';
import { MARKETS } from '@/lib/marketplace';
import { protectionPlanName } from '@/lib/protection';
import { emiPlans } from '@/lib/emi';

/**
 * GET /api/v1/products/:id — product detail (with live stock, description and spec rows), its rating
 * histogram, its coupon (`{percentOff, clipped}` or null; `clipped` is false signed out), and
 * `frequentlyReturned` (`{reason}` when it often comes back, else null), `usuallyKept` (true when
 * customers rarely send it back), and the store's
 * `protection` plan for it (`{name, unitMinor}` or null), and its card EMI plans (`emi`, India from
 * ₹3,000, else empty), and its Lightning Deal (`lightningDeal`: live, upcoming or sold out, else null)
 * with whether the caller watches it (`watchingDeal`; an upcoming one, signed in), and `returnDays`,
 * how many days after delivery it can be returned (its category's window in its store, else the
 * store's; 0 when it can't be).
 */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  const product = await getProduct(ctx.db, id, { includeArchived: true });
  if (!product) throw new DataError('product_not_found');
  const [info, ratings, coupon, returns, plan, lightning, returnDays] = await Promise.all([
    getProductInfo(ctx.db, id),
    getRatingSummary(ctx.db, id),
    product.archived ? null : couponFor(ctx.db, id, ctx.user != null),
    product.archived ? null : returnSignal(ctx.db, id),
    product.archived ? null : protectionOffer(ctx.db, id),
    product.archived ? null : lightningDealsFor(ctx.db, [id]),
    categoryReturnDays(ctx.db, product.market, product.category, MARKETS[product.market].returns.days),
  ]);
  const protection = plan ? { name: protectionPlanName(product.market), unitMinor: plan } : null;
  const emi = product.archived ? [] : emiPlans(product.market, product.priceMinor);
  const lightningDeal = lightning?.get(id) ?? null;
  const watchingDeal = ctx.user && lightningDeal?.state === 'upcoming' ? (await watchedDeals(ctx.db, [lightningDeal.id])).has(lightningDeal.id) : false;
  return json({ product: { ...product, ...info }, ratings, coupon, frequentlyReturned: returns?.frequent ?? null, usuallyKept: returns?.usuallyKept ?? false, protection, emi, lightningDeal, watchingDeal, returnDays });
});

export const OPTIONS = preflight;
