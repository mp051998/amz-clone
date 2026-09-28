import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { DealCard } from '@/components/deals/DealCard';
import { viewerSavedIds } from '@/components/deals/viewerSaved';
import { Page, PageHead, Section, cardGrid } from '@/components/brand/Page';
import { Pill } from '@/components/decision/Pill';
import { EmptyState } from '@/components/decision/Badges';
import { buttonClasses } from '@/components/primitives/Button';
import { db } from '@/lib/supabase/server';
import { listProducts } from '@/lib/data/catalog';
import { storeCategories } from '@/lib/storefront';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export const metadata: Metadata = { title: "Today's Deals · Store" };

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const store = await getMarketplace();
  const [all, categories, saved] = await Promise.all([
    listProducts(await db(), store.id, { dealsOnly: true }),
    storeCategories(),
    viewerSavedIds(store.id),
  ]);
  const present = new Set(all.map((p) => p.category));
  const chips = categories.filter((cat) => present.has(cat.slug));
  const categoryName = (slug: string) => categories.find((x) => x.slug === slug)?.name ?? slug;
  const items = c ? all.filter((p) => p.category === c) : all;
  // biggest real saving first — the reason a deal is worth a look
  const sorted = [...items].sort((a, b) => (b.dealPct ?? 0) - (a.dealPct ?? 0));

  return (
    <AppShell>
      <Page>
        <PageHead kicker={`Today's deals · ${all.length} live`} title={c ? `Deals in ${categoryName(c)}` : "Today's deals"}>
          Only products with a real saving on their list price, biggest saving first. Compare a few before you commit.
        </PageHead>

        <Section>
          <nav aria-label="Deal categories" className="no-scrollbar -mx-[clamp(16px,3vw,24px)] flex gap-2 overflow-x-auto px-[clamp(16px,3vw,24px)] pb-1">
            <Pill href={storePath(store, '/deals')} selected={!c}>All deals</Pill>
            {chips.map((cat) => (
              <Pill key={cat.slug} href={storePath(store, `/deals?c=${cat.slug}`)} selected={c === cat.slug}>{cat.name}</Pill>
            ))}
          </nav>
          <p className="m-0 text-[14px] text-ink-3">
            {c ? <>{categoryName(c)} · </> : <>All categories · </>}
            <span className="tabular-nums">{items.length}</span> {items.length === 1 ? 'deal' : 'deals'}
          </p>

          {sorted.length ? (
            <div className={cardGrid}>
              {sorted.map((p) => (<DealCard key={p.id} product={p} store={store} saved={saved.has(p.id)} />))}
            </div>
          ) : (
            <EmptyState
              title={c ? `No deals in ${categoryName(c)} right now` : 'No deals right now'}
              action={<a href={storePath(store, c ? `/s?dept=${c}` : '/bestsellers')} className={buttonClasses({ variant: 'secondary' })}>{c ? `Browse ${categoryName(c)}` : 'See bestsellers'}</a>}
            >
              Deals change daily. Check back tomorrow, or browse at full price.
            </EmptyState>
          )}
        </Section>
      </Page>
    </AppShell>
  );
}
