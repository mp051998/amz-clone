import { body, intParam, json, preflight, requireUser, route } from '@/lib/api/http';
import { listGiftCardPurchases, startGiftCardPurchase } from '@/lib/data/gift-card-purchases';
import { startGiftCardCheckout } from '@/lib/data/payments';
import { storePath } from '@/lib/marketplace';

/** GET /api/v1/me/gift-cards?limit=20 — gift cards the caller bought in this store (paid ones), newest first, with codes. */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  const limit = intParam(ctx.req.nextUrl.searchParams.get('limit'), 20, 1, 50);
  return json({ items: await listGiftCardPurchases(ctx.db, ctx.market, limit) });
});

/**
 * POST /api/v1/me/gift-cards { amountMinor, recipientName?, message? } — buy a gift card. Returns
 * `201 {purchase, checkoutUrl}`: pay on Stripe's page; the code is issued once Stripe reports it paid.
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  const purchase = await startGiftCardPurchase(ctx.db, ctx.market, { amountMinor: b.amountMinor, recipientName: b.recipientName, message: b.message });
  const origin = ctx.req.nextUrl.origin;
  const sp = (path: string) => `${origin}${storePath({ id: ctx.market }, path)}`;
  const checkoutUrl = await startGiftCardCheckout(purchase, { successUrl: sp('/gift-cards/success'), cancelUrl: sp('/gift-cards?canceled=1#buy') }, 'Store gift card');
  return json({ purchase, checkoutUrl }, { status: 201 });
});

export const OPTIONS = preflight;
