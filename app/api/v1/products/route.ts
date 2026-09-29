import { json, preflight, route } from '@/lib/api/http';
import { searchCatalog } from '@/lib/data/catalog';
import { PAGE_SIZE, parseQuery } from '@/lib/search';

/**
 * GET /api/v1/products?market=US&q=&dept=&brand=a,b&rating=4&deal=1&sort=featured&page=1
 * Full-text search + facets over the store's catalog, one page at a time.
 * sort: featured | price-asc | price-desc | review | newest
 */
export const GET = route(async (ctx) => {
  const sp = ctx.req.nextUrl.searchParams;
  const query = parseQuery({
    k: sp.get('q') ?? sp.get('k') ?? undefined,
    dept: sp.get('dept') ?? undefined,
    brand: sp.get('brand') ?? undefined,
    rating: sp.get('rating') ?? undefined,
    deal: sp.get('deal') === '1' || sp.get('deal') === 'true' ? '1' : undefined,
    sort: sp.get('sort') ?? undefined,
    page: sp.get('page') ?? undefined,
  });
  const r = await searchCatalog(ctx.db, ctx.market, query);
  return json({
    market: ctx.market,
    query: r.query,
    total: r.total,
    page: r.query.page,
    pageSize: PAGE_SIZE,
    pageCount: r.pageCount,
    brands: r.brandFacets,
    items: r.items,
  });
});

export const OPTIONS = preflight;
