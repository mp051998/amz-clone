import { adminOnly } from '@/lib/api/admin';
import { body, json, preflight, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { receiveTradeIn, rejectTradeIn } from '@/lib/data/trade-ins';
import { isExchangeCondition } from '@/lib/exchange';

const ACTIONS = ['receive', 'reject'] as const;

/**
 * POST /api/v1/admin/trade-ins/:id/{receive,reject}
 * - receive `{ condition: "good" | "screen_damaged" }`: the device arrived in that condition; pays
 *   what it's worth as it came, never more than the quote, into the shopper's balance.
 * - reject `{ note? }`: it isn't the device or doesn't switch on; sent back, and the shopper sees
 *   the note (≤ 500 chars).
 * `404 trade_in_not_found` (or in another store), `409 trade_in_closed` unless it's open.
 */
export const POST = route<{ id: string; action: string }>(async (ctx, { id, action }) => {
  await adminOnly(ctx);
  if (!(ACTIONS as readonly string[]).includes(action)) throw new DataError('not_found');
  const input = await body(ctx.req);
  if (action === 'receive') {
    if (!isExchangeCondition(input.condition)) throw new DataError('invalid_input', 'condition', 'Send condition: "good" or "screen_damaged".');
    return json({ tradeIn: await receiveTradeIn(ctx.db, ctx.market, id, input.condition) });
  }
  return json({ tradeIn: await rejectTradeIn(ctx.db, ctx.market, id, input.note) });
});

export const OPTIONS = preflight;
