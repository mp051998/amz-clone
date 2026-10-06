import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { redeemGiftCard } from '@/lib/data/balance';

/**
 * POST /api/v1/me/balance/redeem { code } — redeem a gift card code into this store's balance.
 * 404 gift_card_not_found, 409 gift_card_redeemed, 422 gift_card_other_store.
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  return json(await redeemGiftCard(ctx.db, ctx.market, b.code));
});

export const OPTIONS = preflight;
