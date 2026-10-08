import { json, preflight, requireUser, route } from '@/lib/api/http';
import { cancelTradeIn } from '@/lib/data/trade-ins';

/** POST /api/v1/me/trade-ins/:id/cancel — cancel a trade-in before it's sent: `{tradeIn}`. `409 trade_in_closed`, `404 trade_in_not_found`. */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  return json({ tradeIn: await cancelTradeIn(ctx.db, id) });
});

export const OPTIONS = preflight;
