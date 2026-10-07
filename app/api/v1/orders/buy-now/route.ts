import { json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { buyNowQuote } from '@/lib/data/cart';
import { readBuyNow } from '@/lib/buy-now';

/**
 * GET /api/v1/orders/buy-now?productId=…&qty=1[&protection=1&size=…] — what Buy Now would order: just
 * this product, priced like a cart of it (coupon, delivery, tax). A product that comes in sizes needs
 * one of them (the line says needsSize until it has). Place it with POST /orders { buyNow }.
 */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  const q = ctx.req.nextUrl.searchParams;
  const buy = readBuyNow(q.get('productId'), q.get('qty'), q.get('protection'), q.get('size'));
  if (!buy) throw new DataError('invalid_input', 'productId', 'Say which product to buy.');
  return json({ quote: await buyNowQuote(ctx.db, ctx.market, buy.productId, buy.qty, buy.protection, buy.size) });
});

export const OPTIONS = preflight;
