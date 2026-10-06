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
import { atLeast, discountOptions, readDiscount } from '@/lib/deal-filters';

export const metadata: Metadata = { title: "Today's Deals · Store" };

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ c?: string; off?: string }> }) {
  const sp = await searchParams;
  const c = sp.c;
  const off = readDiscount(sp.off);
  const store = await getMarketplace();
  const [all, categories, saved] = await Promise.all([
    listProducts(await db(), store.id, { dealsOnly: true }),
    storeCategories(),
    viewerSavedIds(store.id),
  ]);
  const present = new Set(all.map((p) => p.category));
  const chips = categories.filter((cat) => present.has(cat.slug));
  const categoryName = (slug: string) => categories.find((x) => x.slug === slug)?.name ?? slug;
  const inCategory = c ? all.filter((p) => p.category === c) : all;
  const items = atLeast(inCategory, off);
  // biggest real saving first — the reason a deal is worth a look
  const sorted = [...items].sort((a, b) => (b.dealPct ?? 0) - (a.dealPct ?? 0));
  const discounts = discountOptions(inCategory.map((p) => p.dealPct ?? 0), off);
  /** this view with the category and/or discount changed */
  const dealsHref = (next: { c?: string | null; off?: number | null }) => {
    const qs = new URLSearchParams();
    const cat = next.c === undefined ? c : next.c;
    const min = next.off === undefined ? off : next.off;
    if (cat) qs.set('c', cat);
    if (min) qs.set('off', String(min));
    const q = qs.toString();
    return storePath(store, q ? `/deals?${q}` : '/deals');
  };
  const offText = off ? `${off}% off or more` : null;

  return (
    <AppShell>
      <Page>
        <PageHead kicker={`Today's deals · ${all.length} live`} title={c ? `Deals in ${categoryName(c)}` : "Today's deals"}>
          Only products with a real saving on their list price, biggest saving first. Compare a few before you commit.
        </PageHead>

        <Section>
          <nav aria-label="Deal categories" className="no-scrollbar -mx-[clamp(16px,3vw,24px)] flex gap-2 overflow-x-auto px-[clamp(16px,3vw,24px)] pb-1">
            <Pill href={dealsHref({ c: null })} selected={!c}>All deals</Pill>
            {chips.map((cat) => (
              <Pill key={cat.slug} href={dealsHref({ c: cat.slug })} selected={c === cat.slug}>{cat.name}</Pill>
            ))}
          </nav>
          {discounts.length ? (
            <div role="group" aria-label="Discount" className="no-scrollbar -mx-[clamp(16px,3vw,24px)] flex gap-2 overflow-x-auto px-[clamp(16px,3vw,24px)] pb-1">
              <Pill size="sm" tone="soft" href={dealsHref({ off: null })} selected={!off}>Any discount</Pill>
              {discounts.map((d) => (
                <Pill key={d.min} size="sm" tone="soft" href={dealsHref({ off: d.min })} selected={off === d.min}>
                  {d.min}% off or more <span className="font-mono text-[12px] opacity-75">{d.count}</span>
                </Pill>
              ))}
            </div>
          ) : null}
          <p className="m-0 text-[14px] text-ink-3">
            {c ? <>{categoryName(c)} · </> : <>All categories · </>}
            {offText ? <>{offText} · </> : null}
            <span className="tabular-nums">{items.length}</span> {items.length === 1 ? 'deal' : 'deals'}
          </p>

          {sorted.length ? (
            <div className={cardGrid}>
              {sorted.map((p) => (<DealCard key={p.id} product={p} store={store} saved={saved.has(p.id)} />))}
            </div>
          ) : (
            off && inCategory.length ? (
              <EmptyState
                title={`No deals ${offText}${c ? ` in ${categoryName(c)}` : ''} right now`}
                action={<a href={dealsHref({ off: null })} className={buttonClasses({ variant: 'secondary' })}>Show every discount</a>}
              >
                The biggest saving here is {Math.max(...inCategory.map((p) => p.dealPct ?? 0))}% off.
              </EmptyState>
            ) : (
              <EmptyState
                title={c ? `No deals in ${categoryName(c)} right now` : 'No deals right now'}
                action={<a href={storePath(store, c ? `/s?dept=${c}` : '/bestsellers')} className={buttonClasses({ variant: 'secondary' })}>{c ? `Browse ${categoryName(c)}` : 'See bestsellers'}</a>}
              >
                Deals change daily. Check back tomorrow, or browse at full price.
              </EmptyState>
            )
          )}
        </Section>
      </Page>
    </AppShell>
  );
}
