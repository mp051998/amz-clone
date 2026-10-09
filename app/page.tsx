import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { SearchBar } from '@/components/chrome/SearchBar';
import { BuyAgainGrid, ContinueRow, DealGrid, HomeSection, PickGrid, SavedBackGrid, SavedDropGrid } from '@/components/home/HomeSections';
import { Kicker } from '@/components/decision/Badges';
import { Pill } from '@/components/decision/Pill';
import { QuizButton } from '@/components/quiz/QuizDialog';
import { savedUpdates, type SavedUpdates } from '@/lib/data/collections';
import { buyAgain } from '@/lib/data/buy-again';
import { inspiredBy } from '@/lib/data/also-viewed';
import { buyableAgain } from '@/lib/buy-again';
import { bestSellerDepts, exampleQueries, getDecisionHome, greetingFor } from '@/lib/home-content';
import { listProducts } from '@/lib/data/catalog';
import type { Product } from '@/lib/types';
import { readRecentIds, readRecsSkipped } from '@/lib/recent';
import { firstName, readUser } from '@/lib/auth';
import { storeCategories } from '@/lib/storefront';
import { db } from '@/lib/supabase/server';
import { getMarketplace } from '@/lib/marketplace-server';
import { siteOrigin } from '@/lib/origin';
import { jsonLdHtml, websiteJsonLd } from '@/lib/seo';
import { storePath } from '@/lib/marketplace';

/** Past purchases looked at for the home page's "Buy again" row (the in-stock ones come first). */
const BUY_AGAIN_SCAN = 12;
/** Products in "Inspired by your browsing history", after leaving out the picks shown below it. */
const INSPIRED_MAX = 8;
/** "Best Sellers in …" rows at the foot of the home page, and products in each. */
const BEST_SELLER_ROWS = 2;
const BEST_SELLER_MAX = 8;

export async function generateMetadata(): Promise<Metadata> {
  const store = await getMarketplace();
  return { title: `${store.name} — shop by what matters to you` };
}

export default async function Home() {
  const store = await getMarketplace();
  const [client, user, recentIds, skipped, categories] = await Promise.all([db(), readUser(), readRecentIds(), readRecsSkipped(), storeCategories()]);
  const now = new Date();
  const none: SavedUpdates = { back: [], drops: [] };
  const decision = getDecisionHome(client, store, recentIds, now);
  // the departments looked at most recently come first
  const sellers = decision.then((h) =>
    Promise.all(
      bestSellerDepts(h.recent, categories, BEST_SELLER_ROWS).map((dept) =>
        listProducts(client, store.id, { category: dept.slug, order: 'popular', limit: BEST_SELLER_MAX })
          .catch((): Product[] => [])
          .then((items) => ({ dept, items })),
      ),
    ),
  );
  const [home, { back, drops }, again, related, bestSellers] = await Promise.all([
    decision,
    user ? savedUpdates(client, store.id, 4).catch(() => none) : Promise.resolve(none),
    user ? buyAgain(client, store.id, BUY_AGAIN_SCAN).then((items) => buyableAgain(items, 4)).catch(() => []) : Promise.resolve([]),
    inspiredBy(client, store.id, recentIds, INSPIRED_MAX * 2, skipped).catch(() => []),
    sellers,
  ]);
  const picked = new Set(home.picks.map((x) => x.product.id));
  const inspired = related.filter((p) => !picked.has(p.id)).slice(0, INSPIRED_MAX);
  const greeting = user ? `${greetingFor(now, store.dates.timeZone)}, ${firstName(user)}` : 'Welcome';
  const searchHref = storePath(store, '/s');
  const site = websiteJsonLd(await siteOrigin(), store.id, store.name);

  return (
    <AppShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(site) }} />
      <div className="mx-auto flex w-full max-w-page flex-col gap-14 px-[clamp(16px,3vw,24px)] pb-10 pt-10">
        <section aria-labelledby="home-title" className="flex max-w-[860px] flex-col gap-[18px]">
          <Kicker>{greeting}</Kicker>
          <h1 id="home-title" className="m-0 text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.08] tracking-[-0.02em]">
            What are you looking for?
          </h1>
          <SearchBar
            size="hero"
            actionPath={searchHref}
            market={store.id}
            label="Search for products, brands, or describe what you need"
            placeholder="Search for products, brands, or describe what you need..."
          />
          <div className="flex flex-wrap items-center gap-2">
            <QuizButton
              market={store.id}
              category={null}
              categories={categories}
              className="inline-flex min-h-[34px] items-center rounded-pill bg-ink px-3.5 text-[14px] font-medium text-on-ink hover:bg-ink-raised"
            >
              Not sure what you need? Answer 5 questions
            </QuizButton>
            <span className="text-[14px] text-ink-3">or try:</span>
            {exampleQueries(store).map((q) => (
              <Pill key={q} size="sm" tone="soft" href={`${searchHref}?k=${encodeURIComponent(q)}`} className="max-w-full text-left">
                <span className="truncate">“{q}”</span>
              </Pill>
            ))}
          </div>
        </section>

        {home.recent.length ? (
          <HomeSection id="home-continue" title="Continue shopping" meta="From your recent visits" link={{ href: storePath(store, '/history'), label: 'See history' }}>
            <ContinueRow products={home.recent} store={store} />
          </HomeSection>
        ) : null}

        {inspired.length ? (
          <HomeSection id="home-inspired" title="Inspired by your browsing history" meta="What shoppers looked at alongside the things you viewed" link={{ href: storePath(store, '/recommendations'), label: 'More for you' }}>
            <ContinueRow products={inspired} store={store} kicker={(p) => p.brand ?? p.categoryName} />
          </HomeSection>
        ) : null}

        {again.length ? (
          <HomeSection id="home-again" title="Buy again" meta="From your orders, in stock now" link={{ href: storePath(store, '/orders/buy-again'), label: 'See all' }}>
            <BuyAgainGrid items={again} store={store} />
          </HomeSection>
        ) : null}

        {back.length ? (
          <HomeSection id="home-back" title="Back in stock on things you saved" meta="Sold out when you saved them" link={{ href: storePath(store, '/collections'), label: 'See your lists' }}>
            <SavedBackGrid items={back} store={store} />
          </HomeSection>
        ) : null}

        {drops.length ? (
          <HomeSection id="home-drops" title="Price drops on things you saved" meta="Cheaper than when you saved them" link={{ href: storePath(store, '/collections'), label: 'See your lists' }}>
            <SavedDropGrid drops={drops} store={store} />
          </HomeSection>
        ) : null}

        {home.picks.length ? (
          <HomeSection id="home-picks" title={home.personal ? "Picks based on what you've been looking at" : 'Popular picks to start with'}>
            <PickGrid picks={home.picks} store={store} />
          </HomeSection>
        ) : null}

        {home.deals.length ? (
          <HomeSection id="home-deals" title="Deals for you" meta={home.personal ? "Deals on things you've shown interest in first" : "Today's biggest price drops"}>
            <DealGrid deals={home.deals} store={store} />
          </HomeSection>
        ) : null}

        {bestSellers.map(({ dept, items }) =>
          items.length ? (
            <HomeSection key={dept.slug} id={`home-best-${dept.slug}`} title={`Best Sellers in ${dept.name}`} link={{ href: storePath(store, `/bestsellers?c=${encodeURIComponent(dept.slug)}`), label: 'See more' }}>
              <ContinueRow products={items} store={store} kicker={(p) => `#${items.indexOf(p) + 1} in ${dept.name}`} />
            </HomeSection>
          ) : null,
        )}
      </div>
    </AppShell>
  );
}
