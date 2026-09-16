import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { RankCard } from '@/components/bestsellers/RankCard';
import { allProducts, categories, categoryName } from '@/lib/catalog-market';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export const metadata: Metadata = { title: 'Amazon Best Sellers' };

/** popularity proxy: review volume, then rating as a tiebreak. */
function byPopularity<T extends { reviewCount: number; rating: number }>(a: T, b: T) {
  return b.reviewCount - a.reviewCount || b.rating - a.rating;
}

export default async function BestSellersPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const store = await getMarketplace();
  const all = allProducts(store.id);
  const present = new Set(all.map((p) => p.category));
  const chips = categories.filter((cat) => present.has(cat.slug));
  const items = (c ? all.filter((p) => p.category === c) : all).slice().sort(byPopularity).slice(0, 40);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] px-4 py-4">
        <nav className="text-[13px] text-ink-3">
          <a href={storePath(store, '/')} className="text-link-teal hover:text-brand-count hover:underline">{store.name}</a>
          <span className="mx-1">›</span>
          <span className="text-ink-2">Best Sellers{c ? <> › {categoryName(c)}</> : null}</span>
        </nav>

        <h1 className="mt-2 text-[28px] font-bold text-ink">Amazon Best Sellers</h1>
        <p className="mt-1 text-[13px] text-ink-2">Our most popular products based on sales. Updated frequently.</p>

        <div className="mt-4 gap-6 md:grid md:grid-cols-[220px_1fr]">
          {/* category rail */}
          <aside className="mb-4 md:mb-0">
            <h2 className="text-[16px] font-bold text-ink">Best Sellers in</h2>
            <ul className="mt-2 space-y-1 text-[13px]">
              <li>
                <a href={storePath(store, '/bestsellers')} className={!c ? 'font-bold text-ink' : 'text-link-teal hover:text-brand-count hover:underline'}>
                  Any Department
                </a>
              </li>
              {chips.map((cat) => (
                <li key={cat.slug}>
                  <a
                    href={storePath(store, `/bestsellers?c=${cat.slug}`)}
                    className={c === cat.slug ? 'font-bold text-ink' : 'text-link-teal hover:text-brand-count hover:underline'}
                  >
                    {cat.name}
                  </a>
                </li>
              ))}
            </ul>
          </aside>

          {/* ranked grid */}
          <div>
            <p className="mb-3 text-[13px] text-ink-2">
              {c ? <>Top picks in <b className="text-ink">{categoryName(c)}</b></> : <>Top picks across all departments</>} · {items.length} items
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((p, i) => (<RankCard key={p.id} product={p} store={store} rank={i + 1} />))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
