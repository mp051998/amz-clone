import { adminOnly } from '@/lib/api/admin';
import { intParam, json, preflight, route } from '@/lib/api/http';
import { listProductReportQueue, productReportView } from '@/lib/data/product-reports';

/**
 * GET /api/v1/admin/product-reports?view=&page= — shoppers' reports on this store's products.
 * view: open (the default, oldest first) | closed | all (latest first). `counts` has each view's total.
 */
export const GET = route(async (ctx) => {
  await adminOnly(ctx);
  const p = ctx.req.nextUrl.searchParams;
  return json(
    await listProductReportQueue(ctx.db, ctx.market, {
      view: productReportView(p.get('view')),
      page: intParam(p.get('page'), 1, 1, 10_000),
    }),
  );
});

export const OPTIONS = preflight;
