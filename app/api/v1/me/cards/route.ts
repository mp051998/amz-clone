import { json, preflight, requireUser, route } from '@/lib/api/http';
import { listSavedCards, startAddCard } from '@/lib/data/wallet';
import { storePath } from '@/lib/marketplace';

/**
 * GET /api/v1/me/cards — the caller's saved cards ("Your Payments"), newest first:
 * `{items: [{id, brand, last4, expMonth, expYear, expired}]}`. Cards live on Stripe; they're saved
 * when paying by card (Stripe's page offers it) or added with POST.
 */
export const GET = route(async (ctx) => {
  const user = requireUser(ctx);
  return json({ items: await listSavedCards(user.id) });
});

/** POST /api/v1/me/cards — add a card: `201 {checkoutUrl}`, Stripe's page to type it on. */
export const POST = route(async (ctx) => {
  const user = requireUser(ctx);
  const origin = ctx.req.nextUrl.origin;
  const sp = (path: string) => `${origin}${storePath({ id: ctx.market }, path)}`;
  const checkoutUrl = await startAddCard(user, { successUrl: sp('/account/payments'), cancelUrl: sp('/account/payments?canceled=1') });
  return json({ checkoutUrl }, { status: 201 });
});

export const OPTIONS = preflight;
