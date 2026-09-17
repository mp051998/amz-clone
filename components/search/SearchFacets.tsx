import { categoriesFor } from '@/lib/catalog-market';
import { buildHref, type SearchQuery } from '@/lib/search';
import { storePath } from '@/lib/marketplace';
import type { Store } from '../lib/store';
import { IconStar } from '../icons/index';

function baseParams(q: SearchQuery): Record<string, string | number | undefined> {
  return {
    k: q.k,
    dept: q.dept,
    brand: q.brand?.length ? q.brand.join(',') : undefined,
    rating: q.rating,
    deal: q.deal ? 1 : undefined,
    sort: q.sort === 'featured' ? undefined : q.sort,
    // page intentionally dropped — any facet change returns to page 1
  };
}

function StarRow({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center">
      {Array.from({ length: 5 }, (_, i) => (
        <IconStar key={i} width={16} height={16} className={i < n ? 'text-star' : 'text-line-2'} />
      ))}
    </span>
  );
}

export interface SearchFacetsProps {
  query: SearchQuery;
  brandFacets: { name: string; count: number }[];
  store: Store;
}

/** Link-driven facet rail: department, brand, reviews, deals. SSR — works without JS (design.md §5). */
export function SearchFacets({ query, brandFacets, store }: SearchFacetsProps) {
  const base = baseParams(query);
  const href = (params: Parameters<typeof buildHref>[0]) => storePath(store, buildHref(params));

  const deptHref = (slug?: string) => href({ ...base, dept: slug, brand: undefined });

  const toggleBrand = (name: string) => {
    const set = new Set(query.brand ?? []);
    if (set.has(name)) set.delete(name); else set.add(name);
    return href({ ...base, brand: set.size ? [...set].join(',') : undefined });
  };

  const ratingHref = (n?: number) => href({ ...base, rating: query.rating === n ? undefined : n });
  const dealHref = href({ ...base, deal: query.deal ? undefined : 1 });

  return (
    <aside className="w-full shrink-0 pr-4 text-[14px] md:w-[240px]">
      {/* Department */}
      <div className="mb-5">
        <h3 className="mb-1.5 text-[16px] font-bold text-ink">Department</h3>
        <ul className="space-y-1">
          <li>
            <a href={deptHref(undefined)} className={query.dept ? 'text-link hover:text-link-hover hover:underline' : 'font-bold text-ink'}>
              All Departments
            </a>
          </li>
          {categoriesFor(store.id).map((c) => (
            <li key={c.slug}>
              <a href={deptHref(c.slug)} className={query.dept === c.slug ? 'font-bold text-ink' : 'text-link hover:text-link-hover hover:underline'}>
                {c.name}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* Brands */}
      {brandFacets.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-1.5 text-[16px] font-bold text-ink">Brands</h3>
          <ul className="space-y-0.5">
            {brandFacets.slice(0, 10).map((b) => {
              const checked = query.brand?.includes(b.name) ?? false;
              return (
                <li key={b.name}>
                  <a href={toggleBrand(b.name)} className="flex items-center gap-2 py-0.5 hover:text-link-hover">
                    <span aria-hidden className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border ${checked ? 'border-link-teal bg-link-teal text-white' : 'border-line-2 bg-white'}`}>
                      {checked ? '✓' : ''}
                    </span>
                    <span className={checked ? 'font-semibold text-ink' : 'text-ink'}>{b.name}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Customer Reviews */}
      <div className="mb-5">
        <h3 className="mb-1.5 text-[16px] font-bold text-ink">Customer Reviews</h3>
        <ul className="space-y-1">
          {[4, 3, 2, 1].map((n) => (
            <li key={n}>
              <a href={ratingHref(n)} className={`flex items-center gap-1.5 ${query.rating === n ? 'font-semibold' : ''}`}>
                <StarRow n={n} />
                <span className="text-ink-2 hover:text-link-hover">&amp; Up</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* Deals */}
      <div className="mb-5">
        <h3 className="mb-1.5 text-[16px] font-bold text-ink">Deals &amp; Discounts</h3>
        <label className="flex items-center gap-2">
          <a href={dealHref} className="flex items-center gap-2 hover:text-link-hover">
            <span aria-hidden className={`flex h-4 w-4 items-center justify-center rounded-[2px] border ${query.deal ? 'border-link-teal bg-link-teal text-white' : 'border-line-2 bg-white'}`}>
              {query.deal ? '✓' : ''}
            </span>
            <span className={query.deal ? 'font-semibold text-ink' : 'text-ink'}>All Discounts</span>
          </a>
        </label>
      </div>
    </aside>
  );
}
