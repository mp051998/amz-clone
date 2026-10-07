import { adminOnly } from '@/lib/api/admin';
import { json, preflight, route } from '@/lib/api/http';
import { adminOverview } from '@/lib/data/admin-overview';

/**
 * GET /api/v1/admin/overview — what needs doing in this store: orders to ship, in transit and with
 * refund problems; open returns and return refund problems; reported reviews; unanswered
 * questions; support cases waiting (and since when); products out of and low on stock.
 */
export const GET = route(async (ctx) => {
  await adminOnly(ctx);
  return json({ overview: await adminOverview(ctx.db, ctx.market) });
});

export const OPTIONS = preflight;
