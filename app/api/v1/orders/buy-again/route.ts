import { intParam, json, preflight, requireUser, route } from '@/lib/api/http';
import { BUY_AGAIN_MAX, buyAgain } from '@/lib/data/buy-again';

/**
 * GET /api/v1/orders/buy-again?limit=60 — each product from the caller's placed orders once,
 * the ones they can buy now first, newest first, with the product as it is today.
 */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  const limit = intParam(ctx.req.nextUrl.searchParams.get('limit'), BUY_AGAIN_MAX, 1, BUY_AGAIN_MAX);
  return json({ items: await buyAgain(ctx.db, ctx.market, limit) });
});

export const OPTIONS = preflight;
