import { adminOnly } from '@/lib/api/admin';
import { intParam, json, preflight, route } from '@/lib/api/http';
import { listAdminOrders, orderFilter } from '@/lib/data/admin-orders';

/**
 * GET /api/v1/admin/orders?filter=&q=&page= — this store's placed or charged orders, newest
 * first. filter: all | preparing | shipped | delivered | cancelled | refund_issues; q: order
 * number prefix or customer email. `counts` has every filter's total (ignoring q).
 */
export const GET = route(async (ctx) => {
  await adminOnly(ctx);
  const p = ctx.req.nextUrl.searchParams;
  return json(
    await listAdminOrders(ctx.db, ctx.market, {
      filter: orderFilter(p.get('filter')),
      q: p.get('q') ?? undefined,
      page: intParam(p.get('page'), 1, 1, 10_000),
    }),
  );
});

export const OPTIONS = preflight;
