import { json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { checkoutQuote } from '@/lib/data/promo';
import { readBuyNow, type BuyNow } from '@/lib/buy-now';
import { readPromoCode } from '@/lib/promo';

/**
 * GET /api/v1/orders/quote?promo=CODE[&productId=…&qty=1&protection=1] — the caller's checkout (the
 * cart's ticked lines, or Buy Now's product) priced with a promotion code. A code that doesn't apply
 * comes back as `promoError` with the checkout priced without it.
 */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  const q = ctx.req.nextUrl.searchParams;
  const code = readPromoCode(q.get('promo'));
  if (!code) throw new DataError('invalid_input', 'promo', 'Enter a promotion code.');
  let buy: BuyNow | undefined;
  if (q.has('productId')) {
    buy = readBuyNow(q.get('productId'), q.get('qty'), q.get('protection')) ?? undefined;
    if (!buy) throw new DataError('invalid_input', 'productId', 'Say which product to buy.');
  }
  const { cart, promoError } = await checkoutQuote(ctx.db, ctx.market, code, buy);
  return json({ quote: cart, ...(promoError ? { promoError } : {}) });
});

export const OPTIONS = preflight;
