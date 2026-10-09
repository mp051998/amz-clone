import { json, preflight, route } from '@/lib/api/http';
import { searchCatalog } from '@/lib/data/catalog';
import { PAGE_SIZE, parseQuery } from '@/lib/search';

/**
 * GET /api/v1/products?market=US&q=&dept=&brand=a,b&seller=a|b&size=M,L&attr=Storage:128 GB|256 GB;RAM:8 GB&rating=4&deal=1&climate=1&small=1&condition=used&min=&max=&pct=25&oos=1&sort=featured&page=1
 * Full-text search + facets over the store's catalog, one page at a time.
 * min / max: price range in minor units (cents / paise), either one optional.
 * seller: sold by any of these, `|`-separated (seller names can hold commas).
 * size: comes in any of these sizes, comma-separated.
 * attr: the department's own filters (`attributes` in the response), `label:value|value`, labels `;`-separated.
 * climate=1: Climate Pledge Friendly products only (`climate` in the response: how many of the search are).
 * small=1: Small Business products only (`smallBusiness` in the response: how many of the search are).
 * condition: new | renewed | used, what can be bought that way (`conditions` in the response: how many of the search can be, each).
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
    size: sp.get('size') ?? undefined,
    attr: sp.get('attr') ?? undefined,
    rating: sp.get('rating') ?? undefined,
    deal: sp.get('deal') === '1' || sp.get('deal') === 'true' ? '1' : undefined,
    climate: sp.get('climate') === '1' || sp.get('climate') === 'true' ? '1' : undefined,
    small: sp.get('small') === '1' || sp.get('small') === 'true' ? '1' : undefined,
    condition: sp.get('condition') ?? undefined,
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
    sizes: r.sizeFacets,
    climate: r.climateCount ?? 0,
    smallBusiness: r.smallBusinessCount ?? 0,
    conditions: r.conditionCounts,
    attributes: r.attributeFacets ?? [],
    unavailable: r.unavailable,
    items: r.items,
  });
});

export const OPTIONS = preflight;
