import { adminOnly } from '@/lib/api/admin';
import { intParam, json, preflight, route } from '@/lib/api/http';
import { listAdminReturns, returnFilter } from '@/lib/data/admin-returns';

/**
 * GET /api/v1/admin/returns?filter=&page= — this store's returns. filter: open (waiting for the
 * items, oldest first; the default) | refund_issues (received, card refund failed or stalled) |
 * closed | all. `counts` has every filter's total.
 */
export const GET = route(async (ctx) => {
  await adminOnly(ctx);
  const p = ctx.req.nextUrl.searchParams;
  return json(
    await listAdminReturns(ctx.db, ctx.market, {
      filter: returnFilter(p.get('filter')),
      page: intParam(p.get('page'), 1, 1, 10_000),
    }),
  );
});

export const OPTIONS = preflight;
