import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { ContinueRow, DealGrid, HomeSection, PickGrid } from '@/components/home/HomeSections';
import { Kicker } from '@/components/decision/Badges';
import { Pill } from '@/components/decision/Pill';
import { QuizButton } from '@/components/quiz/QuizDialog';
import { exampleQueries, getDecisionHome, greetingFor } from '@/lib/home-content';
import { readRecentIds } from '@/lib/recent';
import { firstName, readUser } from '@/lib/auth';
import { storeCategories } from '@/lib/storefront';
import { db } from '@/lib/supabase/server';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getMarketplace();
  return { title: `${store.name} — shop by what matters to you` };
}

export default async function Home() {
  const store = await getMarketplace();
  const [client, user, recentIds, categories] = await Promise.all([db(), readUser(), readRecentIds(), storeCategories()]);
  const now = new Date();
  const home = await getDecisionHome(client, store, recentIds, now);
  const greeting = user ? `${greetingFor(now, store.dates.timeZone)}, ${firstName(user)}` : 'Welcome';
  const searchHref = storePath(store, '/s');

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-page flex-col gap-14 px-[clamp(16px,3vw,24px)] pb-10 pt-10">
        <section aria-labelledby="home-title" className="flex max-w-[860px] flex-col gap-[18px]">
          <Kicker>{greeting}</Kicker>
          <h1 id="home-title" className="m-0 text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.08] tracking-[-0.02em]">
            What are you looking for?
          </h1>
          <form action={searchHref} method="get" role="search" className="flex items-stretch overflow-hidden rounded-panel border-[1.5px] border-ink bg-surface shadow-hero focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
            <label htmlFor="home-q" className="sr-only">Search for products, brands, or describe what you need</label>
            <input
              id="home-q"
              name="k"
              type="search"
              autoComplete="off"
              placeholder="Search for products, brands, or describe what you need..."
              className="min-w-0 flex-1 border-0 bg-transparent px-[18px] py-[18px] text-[17px] outline-none placeholder:text-ink-4"
            />
            <button type="submit" className="bg-accent px-[26px] text-[16px] font-semibold text-ink hover:bg-accent-hover">Search</button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <QuizButton
              market={store.id}
              category={null}
              categories={categories}
              className="inline-flex min-h-[34px] items-center rounded-pill bg-ink px-3.5 text-[14px] font-medium text-white hover:bg-ink-raised"
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
          <HomeSection id="home-continue" title="Continue shopping" meta="From your recent visits">
            <ContinueRow products={home.recent} store={store} />
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
