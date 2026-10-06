import { json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { buyNowQuote } from '@/lib/data/cart';
import { readBuyNow } from '@/lib/buy-now';

/**
 * GET /api/v1/orders/buy-now?productId=…&qty=1 — what Buy Now would order: just this product,
 * priced like a cart of it (coupon, delivery, tax). Place it with POST /orders { buyNow }.
 */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  const q = ctx.req.nextUrl.searchParams;
  const buy = readBuyNow(q.get('productId'), q.get('qty'));
  if (!buy) throw new DataError('invalid_input', 'productId', 'Say which product to buy.');
  return json({ quote: await buyNowQuote(ctx.db, ctx.market, buy.productId, buy.qty) });
});

export const OPTIONS = preflight;
