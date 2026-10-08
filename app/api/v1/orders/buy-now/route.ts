import { json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { buyNowQuote } from '@/lib/data/cart';
import { exchangeQuote } from '@/lib/data/exchange';
import { readBuyNow } from '@/lib/buy-now';

/**
 * GET /api/v1/orders/buy-now?productId=…&qty=1[&protection=1&size=…&exchange=…&condition=…] — what Buy Now
 * would order: just this product, priced like a cart of it (coupon, delivery, tax). A product that comes
 * in sizes needs one of them (the line says needsSize until it has). With an old device traded in
 * (`exchange`, a device id from GET /exchange-devices, and `condition`; one unit) `exchange` says what
 * it takes off: `{valueMinor, device}`. Place it with POST /orders { buyNow }.
 */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  const q = ctx.req.nextUrl.searchParams;
  const buy = readBuyNow(q.get('productId'), q.get('qty'), q.get('protection'), q.get('size'), q.get('exchange'), q.get('condition'));
  if (!buy) throw new DataError('invalid_input', 'productId', 'Say which product to buy.');
  if (q.has('exchange') && !buy.exchange) throw new DataError('invalid_input', 'exchange', 'Say the device’s condition: good or screen_damaged.');
  const [quote, exchange] = await Promise.all([
    buyNowQuote(ctx.db, ctx.market, buy.productId, buy.qty, buy.protection, buy.size),
    buy.exchange ? exchangeQuote(ctx.db, ctx.market, buy.productId, buy.exchange) : null,
  ]);
  return json({ quote, ...(exchange ? { exchange } : {}) });
});

export const OPTIONS = preflight;
