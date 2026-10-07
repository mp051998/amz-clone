import { adminOnly } from '@/lib/api/admin';
import { json, preflight, route } from '@/lib/api/http';
import { adminSales } from '@/lib/data/admin-sales';
import { DataError } from '@/lib/data/errors';

/**
 * GET /api/v1/admin/sales?days=30 — how the store sold over its last `days` days (1–365): orders,
 * units and ordered product sales, cancelled orders and returns, day by day, and the best sellers.
 */
export const GET = route(async (ctx) => {
  await adminOnly(ctx);
  const raw = ctx.req.nextUrl.searchParams.get('days');
  const days = raw === null ? 30 : Number(raw);
  if (!Number.isInteger(days)) throw new DataError('invalid_input', 'days');
  return json({ sales: await adminSales(ctx.db, ctx.market, days) });
});

export const OPTIONS = preflight;
