import { adminOnly } from '@/lib/api/admin';
import { json, preflight, route } from '@/lib/api/http';
import { listAdminTradeIns, tradeInFilter } from '@/lib/data/trade-ins';

/**
 * GET /api/v1/admin/trade-ins?filter= — this store's trade-ins with their customers. filter: open
 * (on their way, oldest first; the default) | closed (credited, cancelled or sent back) | all; the
 * latest 200. `counts` has every filter's total.
 */
export const GET = route(async (ctx) => {
  await adminOnly(ctx);
  return json(await listAdminTradeIns(ctx.db, ctx.market, tradeInFilter(ctx.req.nextUrl.searchParams.get('filter'))));
});

export const OPTIONS = preflight;
