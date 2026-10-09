import type { Metadata } from 'next';
import { clearHistory, removeFromHistory, setHistoryPaused } from '@/app/actions/history';
import { AppShell } from '@/components/AppShell';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { EmptyState, ProductFrame } from '@/components/decision';
import { RecentSearches } from '@/components/history/RecentSearches';
import { BuyAgainButton } from '@/components/orders/BuyAgainButton';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { UseForRecs } from '@/components/recommendations/UseForRecs';
import { getProducts } from '@/lib/data/catalog';
import { toStoreMinor } from '@/lib/fx';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { historyPaused, readRecentIds, readRecsSkipped, RECENT_MAX } from '@/lib/recent';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Browsing history · Store' };

/** Your browsing history: what you viewed in this store, newest first, kept in a cookie (no account needed). */
export default async function HistoryPage() {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const cur = store.currency.code;
  const [client, ids, paused, skip] = await Promise.all([db(), readRecentIds(), historyPaused(), readRecsSkipped()]);
  const products = (await getProducts(client, ids)).filter((p) => p.market === store.id);

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Browsing history</h1>
            <span className="text-[15px] text-ink-2">
              The last {RECENT_MAX} products you looked at, kept on this device for 30 days. They&rsquo;re what{' '}
              <a href={sp('/recommendations')} className="text-ink underline underline-offset-2">your recommendations</a> start from.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <form action={setHistoryPaused}>
              <input type="hidden" name="paused" value={paused ? '0' : '1'} />
              <button type="submit" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                {paused ? 'Turn history back on' : 'Pause history'}
              </button>
            </form>
            {ids.length ? (
              <ConfirmAction
                action={clearHistory}
                label="Clear history"
                prompt="Forget every product you've viewed, in both stores?"
                confirmLabel="Yes, clear it"
                pendingLabel="Clearing…"
                cancelLabel="Keep it"
              />
            ) : null}
          </div>
        </div>

        {paused ? <Alert tone="info">History is paused. Products you view and searches you make now aren&rsquo;t added, and what&rsquo;s here stays until you remove it.</Alert> : null}

        <RecentSearches market={store.id} searchPath={sp('/s')} />

        {products.length === 0 ? (
          <EmptyState title="Nothing here yet" action={<a href={sp('/')} className={buttonClasses({ variant: 'dark' })}>Start shopping</a>}>
            {paused ? 'Turn history back on to keep track of products you look at.' : 'Products you look at show up here, so you can find them again.'}
          </EmptyState>
        ) : (
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => {
              const href = sp(`/product/${encodeURIComponent(p.id)}`);
              return (
                <li key={p.id} className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3">
                  <a href={href} tabIndex={-1} aria-hidden className="block">
                    <ProductFrame src={p.image} aspect="1/1" />
                  </a>
                  <a href={href} className="line-clamp-2 text-[14px] font-semibold leading-snug text-ink no-underline hover:underline">
                    {p.title}
                  </a>
                  <span className="text-[13px] text-ink-2">
                    <span aria-hidden className="text-star">★</span> {p.rating.toFixed(1)}
                    <span className="sr-only"> out of 5 stars</span> · {p.reviewCount.toLocaleString('en-US')}
                    <span className="sr-only"> reviews</span>
                  </span>
                  <div className="mt-auto flex flex-col gap-2">
                    {p.stock > 0 ? (
                      <>
                        <strong className="text-[16px] tabular-nums">{formatMoney(toStoreMinor(p.priceMinor, cur, p.curBase), cur)}</strong>
                        <BuyAgainButton productId={p.id} title={p.title} label="Add to cart" block optionsHref={p.sizes ? sp(`/product/${encodeURIComponent(p.id)}`) : undefined} />
                      </>
                    ) : (
                      <span className="text-[13px] font-medium text-ink-2">Currently unavailable</span>
                    )}
                    <div className="flex flex-col items-center">
                      <form action={removeFromHistory}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="border-0 bg-transparent p-1 text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink" aria-label={`Remove ${p.title} from history`}>
                          Remove
                        </button>
                      </form>
                      <UseForRecs product={p} skipped={skip.has(p.id)} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
