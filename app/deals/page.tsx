import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { DealCard } from '@/components/deals/DealCard';
import { viewerSavedIds } from '@/components/deals/viewerSaved';
import { Page, PageHead, Section, cardGrid } from '@/components/brand/Page';
import { Pill } from '@/components/decision/Pill';
import { EmptyState } from '@/components/decision/Badges';
import { buttonClasses } from '@/components/primitives/Button';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { getProducts, listProducts } from '@/lib/data/catalog';
import { myWatchedDeals, watchedDeals } from '@/lib/data/deal-watches';
import { lightningDeals } from '@/lib/data/lightning-deals';
import { storeCategories } from '@/lib/storefront';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { atLeast, discountOptions, readDiscount } from '@/lib/deal-filters';

export const metadata: Metadata = { title: "Today's Deals · Store" };

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ c?: string; off?: string; type?: string }> }) {
  const sp = await searchParams;
  const c = sp.c;
  const type = sp.type === 'lightning' || sp.type === 'watched' || sp.type === 'member' ? sp.type : null;
  const lightningOnly = type === 'lightning';
  // "Watched deals": the Lightning Deals the shopper watches, live or coming up
  const watchedOnly = type === 'watched';
  // "Plus exclusive deals": what's cheaper for members, deal or not; its saving is the member price's
  const memberOnly = type === 'member';
  const off = watchedOnly || memberOnly ? null : readDiscount(sp.off);
  const store = await getMarketplace();
  const client = await db();
  const [deals, memberDeals, categories, saved, lightning, watchedList, user] = await Promise.all([
    listProducts(client, store.id, { dealsOnly: true }),
    listProducts(client, store.id, { memberDeals: true }),
    storeCategories(),
    viewerSavedIds(store.id),
    lightningDeals(client, store.id),
    myWatchedDeals(client, store.id),
    readUser(),
  ]);
  const watchedProducts = watchedOnly ? await getProducts(client, watchedList.map((d) => d.productId)) : [];
  const watched = watchedList.flatMap((deal) => {
    const product = watchedProducts.find((p) => p.id === deal.productId);
    return product ? [{ product, deal }] : [];
  });
  const liveById = new Map(lightning.live.map((d) => [d.productId, d]));
  const all = lightningOnly ? deals.filter((p) => liveById.has(p.id)) : memberOnly ? memberDeals : deals;
  const present = new Set(watchedOnly ? watched.map((w) => w.product.category) : all.map((p) => p.category));
  const chips = categories.filter((cat) => present.has(cat.slug));
  const categoryName = (slug: string) => categories.find((x) => x.slug === slug)?.name ?? slug;
  const inCategory = c ? all.filter((p) => p.category === c) : all;
  const items = atLeast(inCategory, off);
  // Lightning Deals ending soonest first; otherwise the biggest real saving first — the reason a deal is worth a look
  const ends = (id: string) => liveById.get(id)?.endsAt ?? '';
  const sorted = [...items].sort(
    lightningOnly ? (a, b) => ends(a.id).localeCompare(ends(b.id)) : memberOnly ? (a, b) => (b.memberPct ?? 0) - (a.memberPct ?? 0) : (a, b) => (b.dealPct ?? 0) - (a.dealPct ?? 0),
  );
  const discounts = watchedOnly || memberOnly ? [] : discountOptions(inCategory.map((p) => p.dealPct ?? 0), off);
  const watchedHere = c ? watched.filter((w) => w.product.category === c) : watched;
  // what's coming up: in this category, before any discount filter (they aren't discounted yet)
  const upcoming = (await getProducts(client, lightning.upcoming.map((d) => d.productId)))
    .filter((p) => !c || p.category === c)
    .map((p) => ({ product: p, deal: lightning.upcoming.find((d) => d.productId === p.id)! }));
  const watching = await watchedDeals(client, upcoming.map((u) => u.deal.id));
  /** this view with the category, discount and/or deal type changed */
  const dealsHref = (next: { c?: string | null; off?: number | null; type?: 'lightning' | 'watched' | 'member' | null }) => {
    const qs = new URLSearchParams();
    const cat = next.c === undefined ? c : next.c;
    const min = next.off === undefined ? off : next.off;
    const kind = next.type === undefined ? type : next.type;
    if (cat) qs.set('c', cat);
    if (min && kind !== 'watched' && kind !== 'member') qs.set('off', String(min));
    if (kind) qs.set('type', kind);
    const q = qs.toString();
    return storePath(store, q ? `/deals?${q}` : '/deals');
  };
  const offText = off ? `${off}% off or more` : null;
  const memberDealsTitle = `${store.membership.name} exclusive deals`;

  return (
    <AppShell>
      <Page>
        <PageHead kicker={`Today's deals · ${deals.length} live`} title={`${watchedOnly ? 'Watched deals' : lightningOnly ? 'Lightning Deals' : memberOnly ? memberDealsTitle : c ? 'Deals' : "Today's deals"}${c ? ` in ${categoryName(c)}` : ''}`}>
          {watchedOnly
            ? 'The Lightning Deals you’re watching: live ones first, ending soonest, then what’s coming up.'
            : memberOnly
            ? `Lower prices only ${store.membership.name} members get, at checkout. Biggest member saving first.`
            : 'Only products with a real saving on their list price, biggest saving first. Compare a few before you commit.'}
        </PageHead>

        <Section>
          <nav aria-label="Deal categories" className="no-scrollbar -mx-[clamp(16px,3vw,24px)] flex gap-2 overflow-x-auto px-[clamp(16px,3vw,24px)] pb-1">
            <Pill href={dealsHref({ c: null, type: null })} selected={!c && !type}>All deals</Pill>
            {lightning.live.length || lightningOnly ? (
              <Pill href={dealsHref({ type: lightningOnly ? null : 'lightning' })} selected={lightningOnly}>
                Lightning Deals <span className="font-mono text-[12px] opacity-75">{lightning.live.length}</span>
              </Pill>
            ) : null}
            {memberDeals.length || memberOnly ? (
              <Pill href={dealsHref({ type: memberOnly ? null : 'member' })} selected={memberOnly}>
                {memberDealsTitle} <span className="font-mono text-[12px] opacity-75">{memberDeals.length}</span>
              </Pill>
            ) : null}
            {watchedList.length || watchedOnly ? (
              <Pill href={dealsHref({ type: watchedOnly ? null : 'watched' })} selected={watchedOnly}>
                Watched deals <span className="font-mono text-[12px] opacity-75">{watchedList.length}</span>
              </Pill>
            ) : null}
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
            <span className="tabular-nums">{watchedOnly ? watchedHere.length : items.length}</span>{' '}
            {watchedOnly ? (watchedHere.length === 1 ? 'watched deal' : 'watched deals') : items.length === 1 ? 'deal' : 'deals'}
          </p>

          {watchedOnly ? (
            watchedHere.length ? (
              <div className={cardGrid}>
                {watchedHere.map(({ product: p, deal }) => (<DealCard key={p.id} product={p} store={store} saved={saved.has(p.id)} lightning={deal} watching />))}
              </div>
            ) : !user ? (
              <EmptyState
                title="Sign in to see the deals you’re watching"
                action={<a href={storePath(store, `/signin?next=${encodeURIComponent('/deals?type=watched')}`)} className={buttonClasses({ variant: 'dark' })}>Sign in</a>}
              >
                Watch an upcoming Lightning Deal and it shows up here, and in your messages when it goes live.
              </EmptyState>
            ) : (
              <EmptyState
                title={`You’re not watching any deals${c ? ` in ${categoryName(c)}` : ''}`}
                action={<a href={`${dealsHref({ type: null })}${upcoming.length ? '#upcoming' : ''}`} className={buttonClasses({ variant: 'secondary' })}>{upcoming.length ? 'See upcoming deals' : 'See all deals'}</a>}
              >
                Watch an upcoming Lightning Deal and it shows up here, and in your messages when it goes live.
              </EmptyState>
            )
          ) : sorted.length ? (
            <div className={cardGrid}>
              {sorted.map((p) => (<DealCard key={p.id} product={p} store={store} saved={saved.has(p.id)} lightning={liveById.get(p.id)} />))}
            </div>
          ) : (
            off && inCategory.length ? (
              <EmptyState
                title={`No deals ${offText}${c ? ` in ${categoryName(c)}` : ''} right now`}
                action={<a href={dealsHref({ off: null })} className={buttonClasses({ variant: 'secondary' })}>Show every discount</a>}
              >
                The biggest saving here is {Math.max(...inCategory.map((p) => p.dealPct ?? 0))}% off.
              </EmptyState>
            ) : memberOnly ? (
              <EmptyState
                title={`No ${memberDealsTitle}${c ? ` in ${categoryName(c)}` : ''} right now`}
                action={<a href={dealsHref({ type: null })} className={buttonClasses({ variant: 'secondary' })}>See all deals</a>}
              >
                Member prices change often. Check back soon.
              </EmptyState>
            ) : lightningOnly ? (
              <EmptyState
                title={`No Lightning Deals${c ? ` in ${categoryName(c)}` : ''} right now`}
                action={<a href={dealsHref({ type: null })} className={buttonClasses({ variant: 'secondary' })}>See all deals</a>}
              >
                New ones start every hour{upcoming.length ? '; the next are below' : ''}.
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

        {upcoming.length && !off && !watchedOnly ? (
          <Section id="upcoming" title="Upcoming Lightning Deals" note="At these prices from when each starts, for a few hours or until they're claimed">
            <div className={cardGrid}>
              {upcoming.map(({ product: p, deal }) => (<DealCard key={p.id} product={p} store={store} saved={saved.has(p.id)} lightning={deal} watching={watching.has(deal.id)} />))}
            </div>
          </Section>
        ) : null}
      </Page>
    </AppShell>
  );
}
