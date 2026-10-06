import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { SearchBar } from '@/components/chrome/SearchBar';
import { ContinueRow, DealGrid, HomeSection, PickGrid, SavedDropGrid } from '@/components/home/HomeSections';
import { Kicker } from '@/components/decision/Badges';
import { Pill } from '@/components/decision/Pill';
import { QuizButton } from '@/components/quiz/QuizDialog';
import { savedPriceDrops } from '@/lib/data/collections';
import { exampleQueries, getDecisionHome, greetingFor } from '@/lib/home-content';
import { readRecentIds } from '@/lib/recent';
import { firstName, readUser } from '@/lib/auth';
import { storeCategories } from '@/lib/storefront';
import { db } from '@/lib/supabase/server';
import { getMarketplace } from '@/lib/marketplace-server';
import { siteOrigin } from '@/lib/origin';
import { jsonLdHtml, websiteJsonLd } from '@/lib/seo';
import { storePath } from '@/lib/marketplace';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getMarketplace();
  return { title: `${store.name} — shop by what matters to you` };
}

export default async function Home() {
  const store = await getMarketplace();
  const [client, user, recentIds, categories] = await Promise.all([db(), readUser(), readRecentIds(), storeCategories()]);
  const now = new Date();
  const [home, drops] = await Promise.all([
    getDecisionHome(client, store, recentIds, now),
    user ? savedPriceDrops(client, store.id, 4).catch(() => []) : Promise.resolve([]),
  ]);
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
      </div>
    </AppShell>
  );
}
