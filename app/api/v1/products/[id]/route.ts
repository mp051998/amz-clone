import { json, preflight, route } from '@/lib/api/http';
import { getProduct, getProductInfo, getRatingSummary } from '@/lib/data/catalog';
import { protectionOffer } from '@/lib/data/cart';
import { couponFor } from '@/lib/data/coupons';
import { DataError } from '@/lib/data/errors';
import { frequentlyReturned } from '@/lib/data/return-signal';
import { protectionPlanName } from '@/lib/protection';

/**
 * GET /api/v1/products/:id — product detail (with live stock, description and spec rows), its rating
 * histogram, its coupon (`{percentOff, clipped}` or null; `clipped` is false signed out), and
 * `frequentlyReturned` (`{reason}` when it often comes back, else null), and the store's
 * `protection` plan for it (`{name, unitMinor}` or null).
 */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  const product = await getProduct(ctx.db, id, { includeArchived: true });
  if (!product) throw new DataError('product_not_found');
  const [info, ratings, coupon, returns, plan] = await Promise.all([
    getProductInfo(ctx.db, id),
    getRatingSummary(ctx.db, id),
    product.archived ? null : couponFor(ctx.db, id, ctx.user != null),
    product.archived ? null : frequentlyReturned(ctx.db, id),
    product.archived ? null : protectionOffer(ctx.db, id),
  ]);
  const protection = plan ? { name: protectionPlanName(product.market), unitMinor: plan } : null;
  return json({ product: { ...product, ...info }, ratings, coupon, frequentlyReturned: returns, protection });
});

export const OPTIONS = preflight;
