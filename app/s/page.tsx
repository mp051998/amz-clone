import { AppShell } from '@/components/AppShell';
import { Breadcrumbs } from '@/components/commerce/Breadcrumbs';
import { Pagination } from '@/components/commerce/Pagination';
import { SearchFacets } from '@/components/search/SearchFacets';
import { SearchResultRow } from '@/components/search/SearchResultRow';
import { SortSelect } from '@/components/search/SortSelect';
import { categoryName } from '@/lib/catalog';
import { buildHref, parseQuery, runSearch, SORTS, PAGE_SIZE, type SearchQuery } from '@/lib/search';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

/** current params minus `sort`/`page` (both reset when those controls change) */
function paramsBase(q: SearchQuery) {
  return {
    k: q.k,
    dept: q.dept,
    brand: q.brand?.length ? q.brand.join(',') : undefined,
    rating: q.rating,
    deal: q.deal ? 1 : undefined,
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const store = await getMarketplace();
  const query = parseQuery(sp);
  const { items, total, pageCount, brandFacets, headingLabel, query: q } = runSearch(query);

  const base = paramsBase(q);
  const sortOptions = SORTS.map((s) => ({
    label: s.label,
    value: s.key,
    href: storePath(store, buildHref({ ...base, sort: s.key === 'featured' ? undefined : s.key })),
  }));

  const start = total === 0 ? 0 : (q.page - 1) * PAGE_SIZE + 1;
  const end = Math.min(q.page * PAGE_SIZE, total);

  const trail = [
    { label: 'Home', href: storePath(store, '/') },
    ...(q.dept ? [{ label: categoryName(q.dept) }] : q.k ? [{ label: `Results for "${q.k}"` }] : [{ label: 'All' }]),
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] px-4">
        <div className="pt-2">
          <Breadcrumbs trail={trail} />
        </div>

        {/* results header */}
        <div className="mt-1 flex flex-col gap-2 border-b border-line-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[14px] text-ink">
            {total === 0 ? (
              <>No results{q.k ? <> for <span className="font-bold">&quot;{q.k}&quot;</span></> : null}</>
            ) : (
              <>
                {start}–{end} of {total.toLocaleString('en-US')} results
                {q.k ? <> for <span className="font-bold text-price-deal">&quot;{q.k}&quot;</span></> : q.dept ? <> in <span className="font-bold">{categoryName(q.dept)}</span></> : null}
              </>
            )}
          </p>
          <SortSelect options={sortOptions} value={q.sort} />
        </div>

        <div className="flex gap-4 py-4">
          <SearchFacets query={q} brandFacets={brandFacets} store={store} />

          <div className="min-w-0 flex-1">
            {total === 0 ? (
              <div className="py-16 text-center">
                <p className="text-[21px] font-bold text-ink">No results found</p>
                <p className="mt-2 text-[15px] text-ink-2">Try checking your spelling or using more general terms.</p>
                <a href={storePath(store, '/s')} className="mt-4 inline-block text-[14px] text-link hover:text-link-hover hover:underline">Clear all filters</a>
              </div>
            ) : (
              <>
                {items.map((p) => (<SearchResultRow key={p.id} product={p} store={store} />))}
                {pageCount > 1 ? (
                  <Pagination page={q.page} pageCount={pageCount} hrefFor={(n) => storePath(store, buildHref({ ...base, sort: q.sort === 'featured' ? undefined : q.sort, page: n }))} />
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
