import { adminOnly } from '@/lib/api/admin';
import { json, preflight, route } from '@/lib/api/http';
import { listPriceReportQueue, priceReportView } from '@/lib/data/lower-price';

/**
 * GET /api/v1/admin/lower-prices?view= — shoppers' lower-price reports on this store's products,
 * by product. view: open (the default; most reported first) | reviewed. `counts` has each view's
 * number of reports.
 */
export const GET = route(async (ctx) => {
  await adminOnly(ctx);
  return json(await listPriceReportQueue(ctx.db, ctx.market, { view: priceReportView(ctx.req.nextUrl.searchParams.get('view')) }));
});

export const OPTIONS = preflight;
