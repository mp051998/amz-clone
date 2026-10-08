import { json, preflight, route } from '@/lib/api/http';
import { getProduct, getProductInfo, getRatingSummary } from '@/lib/data/catalog';
import { protectionOffer } from '@/lib/data/cart';
import { couponFor } from '@/lib/data/coupons';
import { watchedDeals } from '@/lib/data/deal-watches';
import { DataError } from '@/lib/data/errors';
import { exchangeOffer } from '@/lib/data/exchange';
import { lightningDealsFor } from '@/lib/data/lightning-deals';
import { categoryReturnPolicy } from '@/lib/data/return-policy';
import { typicalPrice, typicalToShow } from '@/lib/data/typical-price';
import { returnSignal } from '@/lib/data/return-signal';
import { holidayReturnBy } from '@/lib/holiday-returns';
import { MARKETS } from '@/lib/marketplace';
import { protectionPlanName } from '@/lib/protection';
import { emiPlans } from '@/lib/emi';
import { exchangeUpTo } from '@/lib/exchange';

/**
 * GET /api/v1/products/:id — product detail (with live stock, description and spec rows), its rating
 * histogram, its coupon (`{percentOff, clipped}` or null; `clipped` is false signed out), and
 * `frequentlyReturned` (`{reason}` when it often comes back, else null), `usuallyKept` (true when
 * customers rarely send it back), `fit` (`small` or `large` when a product in sizes runs that way,
 * by its size returns, else null), and the store's
 * `protection` plan for it (`{name, unitMinor}` or null), and its card EMI plans (`emi`, India from
 * ₹3,000, else empty), and its Lightning Deal (`lightningDeal`: live, upcoming or sold out, else null)
 * with whether the caller watches it (`watchingDeal`; an upcoming one, signed in), and `returnDays`,
 * how many days after delivery it can be returned (its category's window in its store, else the
 * store's; 0 when it can't be), and `replacementOnly`, true when it goes back for a fault only and is
 * replaced (refunded only when it can't be), and `holidayReturnBy` (bought now, amazon.com's holiday
 * returns let it go back until then, or its own window from delivery if later; null out of season,
 * in India or when it can't be returned), and `exchange` (`{kind, upToMinor}`: Buy Now takes an old
 * phone or laptop off it, up to that much; models from GET /exchange-devices) or null, and
 * `typicalPriceMinor`, amazon.com's "Typical price" (the 90-day median) when the price is below it
 * and there's no list price above the price, else null (always in India).
 */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  const product = await getProduct(ctx.db, id, { includeArchived: true });
  if (!product) throw new DataError('product_not_found');
  const [info, ratings, coupon, returns, plan, lightning, policy, trade, typical] = await Promise.all([
    getProductInfo(ctx.db, id),
    getRatingSummary(ctx.db, id),
    product.archived ? null : couponFor(ctx.db, id, ctx.user != null),
    product.archived ? null : returnSignal(ctx.db, id),
    product.archived ? null : protectionOffer(ctx.db, id),
    product.archived ? null : lightningDealsFor(ctx.db, [id]),
    categoryReturnPolicy(ctx.db, product.market, product.category, MARKETS[product.market].returns.days),
    product.archived ? null : exchangeOffer(ctx.db, product.market, product.category),
    product.archived || !MARKETS[product.market].pricing.typicalLabel ? null : typicalPrice(ctx.db, id),
  ]);
  const exchange = trade ? { kind: trade.kind, upToMinor: exchangeUpTo(trade.devices, product.priceMinor) } : null;
  const protection = plan ? { name: protectionPlanName(product.market), unitMinor: plan } : null;
  const emi = product.archived ? [] : emiPlans(product.market, product.priceMinor);
  const lightningDeal = lightning?.get(id) ?? null;
  const watchingDeal = ctx.user && lightningDeal?.state === 'upcoming' ? (await watchedDeals(ctx.db, [lightningDeal.id])).has(lightningDeal.id) : false;
  return json({ product: { ...product, ...info }, ratings, coupon, frequentlyReturned: returns?.frequent ?? null, usuallyKept: returns?.usuallyKept ?? false, fit: product.sizes?.length ? (returns?.fit ?? null) : null, protection, emi, lightningDeal, watchingDeal, returnDays: policy.days, replacementOnly: policy.replacementOnly, holidayReturnBy: policy.days > 0 ? (holidayReturnBy(MARKETS[product.market], new Date())?.toISOString() ?? null) : null, exchange, typicalPriceMinor: typicalToShow(typical, product.priceMinor, product.listMinor) });
});

export const OPTIONS = preflight;
