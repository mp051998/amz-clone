import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { cardGrid } from '@/components/brand/Page';
import { FollowBrand } from '@/components/brand/FollowBrand';
import { RankCard } from '@/components/bestsellers/RankCard';
import { EmptyState } from '@/components/decision';
import { viewerSavedIds } from '@/components/deals/viewerSaved';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { readUser } from '@/lib/auth';
import { followedBrandFeed } from '@/lib/data/brand-follows';
import { storePath } from '@/lib/marketplace';
import { getMarketplace } from '@/lib/marketplace-server';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Brands you follow · Store' };

const PAGE = '/account/brands';

/**
 * /account/brands, Amazon's "Brands you follow": each brand the shopper follows in this store, newest
 * follow first, with what's new from it and its store, and Unfollow ("Following").
 */
export default async function BrandsYouFollowPage({ searchParams }: { searchParams: Promise<{ follow_error?: string }> }) {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const user = await readUser();
  if (!user) redirect(sp(`/signin?next=${PAGE}`));
  const [feed, saved, { follow_error: error }] = await Promise.all([followedBrandFeed(await db(), store.id, user.id), viewerSavedIds(store.id), searchParams]);
  const day = new Intl.DateTimeFormat(store.locale.default, { day: 'numeric', month: 'long', year: 'numeric', timeZone: store.dates.timeZone });
  const storeHref = (brand: string) => sp(`/stores/${encodeURIComponent(brand)}`);

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-page flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-col gap-1.5">
          <a href={sp('/account')} className="self-start text-[14px] text-ink underline underline-offset-2">← Account</a>
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Brands you follow</h1>
          <span className="text-[15px] text-ink-2">What’s new from the brands you follow in this store. Follow a brand from its store.</span>
        </div>

        {error ? <Alert tone="error">We couldn’t change that. Please try again.</Alert> : null}

        {!feed.length ? (
          <EmptyState title="You don’t follow any brands yet" action={<a href={sp('/bestsellers')} className={buttonClasses({ variant: 'secondary' })}>Best Sellers</a>}>
            Choose Follow on a brand’s store (“Visit the store” on any of its products) to see what’s new from it here.
          </EmptyState>
        ) : null}

        {feed.map((f) => (
          <section key={f.brand} aria-label={f.brand} className="flex flex-col gap-3.5 border-t border-line-2 pt-5 first-of-type:border-t-0 first-of-type:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="m-0 text-[20px] font-semibold">
                  <a href={storeHref(f.brand)} className="text-ink no-underline hover:underline">{f.brand}</a>
                </h2>
                <span className="text-[13px] text-ink-3">Following since {day.format(new Date(f.followedAt))}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <a href={storeHref(f.brand)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Visit the store</a>
                <FollowBrand brand={f.brand} following next={PAGE} size="sm" />
              </div>
            </div>
            {f.products.length ? (
              <ul className={`${cardGrid} m-0 list-none p-0`}>
                {f.products.map((p) => (
                  <li key={p.id} className="flex">
                    <div className="flex w-full flex-col [&>article]:flex-1">
                      <RankCard product={p} store={store} saved={saved.has(p.id)} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-[14px] text-ink-2">Nothing from {f.brand} is on sale here right now.</p>
            )}
          </section>
        ))}
      </div>
    </AppShell>
  );
}
