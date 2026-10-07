import { json, preflight, route } from '@/lib/api/http';
import { searchCatalog } from '@/lib/data/catalog';
import { PAGE_SIZE, parseQuery } from '@/lib/search';

/**
 * GET /api/v1/products?market=US&q=&dept=&brand=a,b&seller=a|b&rating=4&deal=1&min=&max=&pct=25&oos=1&sort=featured&page=1
 * Full-text search + facets over the store's catalog, one page at a time.
 * min / max: price range in minor units (cents / paise), either one optional.
 * seller: sold by any of these, `|`-separated (seller names can hold commas).
 * pct: only products on sale for at least this percentage off (1–99).
 * oos=1: include products that are out of stock (left out otherwise).
 * sort: featured | price-asc | price-desc | review | newest | bestsellers
 */
export const GET = route(async (ctx) => {
  const sp = ctx.req.nextUrl.searchParams;
  const query = parseQuery({
    k: sp.get('q') ?? sp.get('k') ?? undefined,
    dept: sp.get('dept') ?? undefined,
    brand: sp.get('brand') ?? undefined,
    seller: sp.get('seller') ?? undefined,
    rating: sp.get('rating') ?? undefined,
    deal: sp.get('deal') === '1' || sp.get('deal') === 'true' ? '1' : undefined,
    min: sp.get('min') ?? undefined,
    max: sp.get('max') ?? undefined,
    pct: sp.get('pct') ?? undefined,
    oos: sp.get('oos') === '1' || sp.get('oos') === 'true' ? '1' : undefined,
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
    sellers: r.sellerFacets,
    unavailable: r.unavailable,
    items: r.items,
  });
});

export const OPTIONS = preflight;
