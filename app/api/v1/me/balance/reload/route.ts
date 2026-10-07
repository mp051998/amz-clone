import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { startBalanceReload } from '@/lib/data/gift-card-purchases';
import { startGiftCardCheckout } from '@/lib/data/payments';
import { storePath } from '@/lib/marketplace';

/**
 * POST /api/v1/me/balance/reload { amountMinor } — reload this store's balance by card. Returns
 * `201 {purchase, checkoutUrl}` (`purchase.reload: true`): pay on Stripe's page; the balance is
 * credited once Stripe reports it paid. 422 invalid_input (amount), 503 payments_unavailable.
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  const purchase = await startBalanceReload(ctx.db, ctx.market, b.amountMinor);
  const origin = ctx.req.nextUrl.origin;
  const sp = (path: string) => `${origin}${storePath({ id: ctx.market }, path)}`;
  const checkoutUrl = await startGiftCardCheckout(
    purchase,
    { successUrl: sp('/gift-cards/success?for=reload'), cancelUrl: sp('/gift-cards?canceled=1&for=reload#balance') },
    ctx.market === 'IN' ? 'Add money to balance' : 'Balance reload',
  );
  return json({ purchase, checkoutUrl }, { status: 201 });
});

export const OPTIONS = preflight;
