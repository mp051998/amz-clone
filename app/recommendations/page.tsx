import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section } from '@/components/brand/Page';
import { EmptyState } from '@/components/decision/Badges';
import { ProductFrame } from '@/components/decision/ProductFrame';
import { ContinueRow } from '@/components/home/HomeSections';
import { buttonClasses } from '@/components/primitives/Button';
import { UseForRecs } from '@/components/recommendations/UseForRecs';
import { readUser } from '@/lib/auth';
import { buyAgain } from '@/lib/data/buy-again';
import { getProducts } from '@/lib/data/catalog';
import { recommendations } from '@/lib/data/recommendations';
import { shortTitle } from '@/lib/decision/verdict';
import { getMarketplace } from '@/lib/marketplace-server';
import { signInPath, storePath } from '@/lib/marketplace';
import { readRecentIds, readRecsSkipped } from '@/lib/recent';
import { db } from '@/lib/supabase/server';
import type { Product } from '@/lib/types';

export const metadata: Metadata = { title: 'Your Recommendations · Store' };

/** Past purchases recommendations can start from, and the list of what they're based on shows. */
const BOUGHT_SCAN = 20;

/**
 * Your Recommendations: rows of what shoppers viewed with the products viewed recently, and what
 * buyers bought with the ones bought, and under them the products they're based on, each of which
 * can be left out ("Improve your recommendations").
 */
export default async function RecommendationsPage() {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const [client, user, recentIds, skip] = await Promise.all([db(), readUser(), readRecentIds(), readRecsSkipped()]);
  const [viewedAll, purchases] = await Promise.all([
    getProducts(client, recentIds),
    user ? buyAgain(client, store.id, BOUGHT_SCAN).catch(() => []) : Promise.resolve([]),
  ]);
  const viewed = viewedAll.filter((p) => p.market === store.id && !p.archived);
  const bought = purchases.flatMap((x) => (x.product && !x.product.archived ? [x.product] : []));
  const groups = await recommendations(client, store.id, { viewed, bought, skip }).catch(() => []);
  const basis = [
    ...viewed.map((p) => ({ product: p, why: 'Viewed' })),
    ...bought.filter((p) => !viewed.some((v) => v.id === p.id)).map((p) => ({ product: p, why: 'Purchased' })),
  ];
  const used = basis.filter((b) => !skip.has(b.product.id)).length;

  return (
    <AppShell>
      <Page>
        <PageHead
          kicker="Your Account"
          title="Your Recommendations"
          actions={basis.length ? <a href="#improve" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Improve your recommendations</a> : null}
        >
          Picked from what you&rsquo;ve viewed{user ? ' and bought' : ''} in this store: what other shoppers looked at and bought alongside it.
          {user ? null : (
            <>
              {' '}
              <a href={signInPath(store, '/recommendations')} className="text-ink underline underline-offset-2">Sign in</a> to include your orders.
            </>
          )}
        </PageHead>

        {groups.length ? (
          groups.map((g) => (
            <Section
              key={`${g.reason}-${g.anchor.id}`}
              title={
                <>
                  Because you {g.reason} <a href={sp(`/product/${encodeURIComponent(g.anchor.id)}`)} className="text-ink underline-offset-2 hover:underline">{shortTitle(g.anchor.title, 6)}</a>
                </>
              }
              note={<UseForRecs product={g.anchor} skipped={false} />}
            >
              <ContinueRow products={g.items} store={store} kicker={(p) => p.brand ?? p.categoryName} />
            </Section>
          ))
        ) : (
          <EmptyState
            title={basis.length ? 'No recommendations right now' : 'Nothing to go on yet'}
            action={<a href={sp('/bestsellers')} className={buttonClasses({ variant: 'dark' })}>See bestsellers</a>}
          >
            {basis.length && !used
              ? 'You’ve asked us not to use anything below. Turn one back on to see recommendations from it.'
              : basis.length
                ? 'Other shoppers haven’t looked at or bought much alongside what you have yet. Check back soon.'
                : `Look at a few products${user ? ', or buy something,' : ''} and recommendations show up here.`}
          </EmptyState>
        )}

        {basis.length ? (
          <Section id="improve" title="Improve your recommendations" note={`${used} of ${basis.length} used`}>
            <p className="m-0 max-w-[680px] text-[15px] text-ink-2">
              Recommendations start from the products you viewed and bought most recently. Leave out any you don&rsquo;t want them based on, like a gift you bought for someone else. It&rsquo;s kept on this device.
            </p>
            <ul className="m-0 flex list-none flex-col divide-y divide-line-2 rounded-card border border-line bg-surface p-0">
              {basis.map(({ product: p, why }) => {
                const skipped = skip.has(p.id);
                return (
                  <li key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <a href={sp(`/product/${encodeURIComponent(p.id)}`)} tabIndex={-1} aria-hidden className="block w-12 flex-none">
                      <ProductFrame src={p.image} aspect="1/1" />
                    </a>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <a href={sp(`/product/${encodeURIComponent(p.id)}`)} className="truncate text-[14px] font-semibold text-ink no-underline hover:underline">{p.title}</a>
                      <span className="text-[13px] text-ink-3">{why}{skipped ? ' · not used for recommendations' : ''}</span>
                    </div>
                    <UseForRecs product={p} skipped={skipped} />
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}
      </Page>
    </AppShell>
  );
}
