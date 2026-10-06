import { json, preflight, route } from '@/lib/api/http';
import { searchCatalog } from '@/lib/data/catalog';
import { PAGE_SIZE, parseQuery } from '@/lib/search';

/**
 * GET /api/v1/products?market=US&q=&dept=&brand=a,b&rating=4&deal=1&min=&max=&sort=featured&page=1
 * Full-text search + facets over the store's catalog, one page at a time.
 * min / max: price range in minor units (cents / paise), either one optional.
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
    min: sp.get('min') ?? undefined,
    max: sp.get('max') ?? undefined,
    sort: sp.get('sort') ?? undefined,
    page: sp.get('page') ?? undefined,
  });
  const r = await searchCatalog(ctx.db, ctx.market, query);
  return json({
    market: ctx.market,
    query: r.query,
    total: r.total,
    groups: r.groups,
    page: r.query.page,
    pageSize: PAGE_SIZE,
    pageCount: r.pageCount,
    brands: r.brandFacets,
    items: r.items,
  });
});

export const OPTIONS = preflight;
