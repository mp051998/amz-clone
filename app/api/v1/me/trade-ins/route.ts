import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { listTradeIns, requestTradeIn } from '@/lib/data/trade-ins';
import { isExchangeCondition } from '@/lib/exchange';
import { hasTradeIn } from '@/lib/trade-in';

/** GET /api/v1/me/trade-ins — the caller's trade-ins in the store, newest first (none outside amazon.com). */
export const GET = route(async (ctx) => {
  requireUser(ctx);
  return json({ tradeIns: await listTradeIns(ctx.db, ctx.market, 50) });
});

/**
 * POST /api/v1/me/trade-ins `{ deviceId, condition: "good" | "screen_damaged" }` — trade in one of
 * the models GET /exchange-devices lists (amazon.com only; a demo: nothing is shipped), 201 with the
 * trade-in: its quote (`quoteMinor`, half the value with a damaged screen), the prepaid label's
 * `shipCode` and `shipBy` (7 days). The credit goes on the store balance once the store receives
 * it. `422 invalid_input` (detail device | condition); `409 trade_in_limit` with 5 waiting to be
 * sent; `404 not_found` in the India store.
 */
export const POST = route(async (ctx) => {
  requireUser(ctx);
  if (!hasTradeIn(ctx.market)) throw new DataError('not_found', undefined, 'Trade-In is for the United States store.');
  const input = await body(ctx.req);
  if (typeof input.deviceId !== 'string' || !input.deviceId) throw new DataError('invalid_input', 'device', 'Send deviceId: one of GET /exchange-devices.');
  if (!isExchangeCondition(input.condition)) throw new DataError('invalid_input', 'condition', 'Send condition: "good" or "screen_damaged".');
  return json({ tradeIn: await requestTradeIn(ctx.db, input.deviceId, input.condition) }, { status: 201 });
});

export const OPTIONS = preflight;
