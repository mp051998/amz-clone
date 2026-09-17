import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { DealCard } from '@/components/deals/DealCard';
import { deals, categoriesFor, categoryName } from '@/lib/catalog-market';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export const metadata: Metadata = { title: "Today's Deals | Amazon" };

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const store = await getMarketplace();
  const all = deals(store.id);
  const present = new Set(all.map((p) => p.category));
  const chips = categoriesFor(store.id).filter((cat) => present.has(cat.slug));
  const items = c ? all.filter((p) => p.category === c) : all;

  return (
    <AppShell>
      <div className="bg-surface-band pb-10">
        {/* banner */}
        <div className="bg-gradient-to-r from-[#cc0c39] via-[#e23744] to-[#ff6138]">
          <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-6">
            <h1 className="text-[30px] font-bold text-white">Today&apos;s Deals</h1>
            <span className="rounded-[4px] bg-white/20 px-2 py-1 text-[13px] font-bold text-white">{all.length} deals live now</span>
          </div>
        </div>

        {/* filter chips */}
        <div className="mx-auto max-w-[1500px] px-4 pt-4">
          <div className="flex flex-wrap gap-2">
            <a href={storePath(store, '/deals')} className={`rounded-pill border px-3 py-1 text-[13px] ${!c ? 'border-ink bg-nav-main text-white' : 'border-line bg-white text-ink hover:bg-surface-2'}`}>All Deals</a>
            {chips.map((cat) => (
              <a key={cat.slug} href={storePath(store, `/deals?c=${cat.slug}`)} className={`rounded-pill border px-3 py-1 text-[13px] ${c === cat.slug ? 'border-ink bg-nav-main text-white' : 'border-line bg-white text-ink hover:bg-surface-2'}`}>
                {cat.name}
              </a>
            ))}
          </div>

          <p className="mt-3 text-[13px] text-ink-2">
            {c ? <>Deals in <b className="text-ink">{categoryName(c)}</b> · {items.length} items</> : <>All categories · {items.length} items</>}
          </p>

          {/* grid */}
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((p) => (<DealCard key={p.id} product={p} store={store} />))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
