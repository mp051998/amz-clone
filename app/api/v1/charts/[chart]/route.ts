import { json, preflight, route } from '@/lib/api/http';
import { chart, isChartKind, listCategories, moversAndShakers } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';

/**
 * GET /api/v1/charts/:chart?dept=&limit=40 — one of the store's charts (bestsellers, new-releases,
 * movers-and-shakers, most-wished-for, gift-ideas) as the site shows it, across the store or in a
 * department. Movers & shakers also says where each product ranks: `ranks: [{productId, rank, wasRank}]`.
 */
export const GET = route<{ chart: string }>(async (ctx, params) => {
  if (!isChartKind(params.chart)) throw new DataError('chart_not_found');
  const sp = ctx.req.nextUrl.searchParams;
  const dept = sp.get('dept') || undefined;
  if (dept && !(await listCategories(ctx.db, ctx.market)).some((c) => c.slug === dept)) throw new DataError('category_not_found');
  const raw = sp.get('limit');
  const limit = raw === null ? 40 : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DataError('invalid_input', 'limit');
  if (params.chart === 'movers-and-shakers') {
    const movers = await moversAndShakers(ctx.db, ctx.market, { category: dept, limit });
    return json({
      market: ctx.market,
      chart: params.chart,
      dept: dept ?? null,
      items: movers.map((m) => m.product),
      ranks: movers.map((m) => ({ productId: m.product.id, rank: m.rank, wasRank: m.wasRank })),
    });
  }
  const items = await chart(ctx.db, ctx.market, params.chart, { category: dept, limit });
  return json({ market: ctx.market, chart: params.chart, dept: dept ?? null, items });
});

export const OPTIONS = preflight;
