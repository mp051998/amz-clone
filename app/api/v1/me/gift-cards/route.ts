import { body, intParam, json, preflight, requireUser, route } from '@/lib/api/http';
import { listGiftCardPurchases, startGiftCardPurchase } from '@/lib/data/gift-card-purchases';
import { startGiftCardCheckout } from '@/lib/data/payments';
import { storePath } from '@/lib/marketplace';

/** GET /api/v1/me/gift-cards?limit=20 — gift cards the caller bought in this store (paid ones), newest first, with codes. Balance reloads aren't gift cards: see /me/balance. */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  const limit = intParam(ctx.req.nextUrl.searchParams.get('limit'), 20, 1, 50);
  return json({ items: (await listGiftCardPurchases(ctx.db, ctx.market, limit)).filter((p) => !p.reload) });
});

/**
 * POST /api/v1/me/gift-cards { amountMinor, quantity?, recipientName?, message? } — buy `quantity` gift cards
 * (1–10, default 1) of `amountMinor` each. Returns `201 {purchase, checkoutUrl}`: pay the total on Stripe's
 * page; a code per card is issued once Stripe reports it paid.
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  const purchase = await startGiftCardPurchase(ctx.db, ctx.market, { amountMinor: b.amountMinor, quantity: b.quantity, recipientName: b.recipientName, message: b.message });
  const origin = ctx.req.nextUrl.origin;
  const sp = (path: string) => `${origin}${storePath({ id: ctx.market }, path)}`;
  const checkoutUrl = await startGiftCardCheckout(purchase, { successUrl: sp('/gift-cards/success'), cancelUrl: sp('/gift-cards?canceled=1#buy') }, 'Store gift card', ctx.user);
  return json({ purchase, checkoutUrl }, { status: 201 });
});

export const OPTIONS = preflight;
