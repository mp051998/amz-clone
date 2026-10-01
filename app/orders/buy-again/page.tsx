import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { EmptyState, ProductFrame } from '@/components/decision';
import { BuyAgainButton } from '@/components/orders/BuyAgainButton';
import { OrdersTabs } from '@/components/orders/OrdersTabs';
import { longDate } from '@/components/orders/format';
import { buttonClasses } from '@/components/primitives/Button';
import { cn } from '@/components/lib/cn';
import { readUser } from '@/lib/auth';
import { buyAgain } from '@/lib/data/buy-again';
import { shortTitle } from '@/lib/decision/verdict';
import { toStoreMinor } from '@/lib/fx';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Buy again · Store' };

const UNAVAILABLE = { sold_out: 'Currently unavailable', gone: 'No longer sold here' } as const;

export default async function BuyAgainPage() {
  const store = await getMarketplace();
  if (!(await readUser())) redirect(storePath(store, '/signin?next=/orders/buy-again'));
  const sp = (path: string) => storePath(store, path);
  const cur = store.currency.code;
  const items = await buyAgain(await db(), store.id);

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Buy again</h1>
          <span className="text-[15px] text-ink-2">What you&rsquo;ve bought in this store, at today&rsquo;s prices.</span>
        </div>
        <OrdersTabs current="buy-again" ordersHref={sp('/orders')} buyAgainHref={sp('/orders/buy-again')} />

        {items.length === 0 ? (
          <EmptyState title="Nothing to buy again yet" action={<a href={sp('/')} className={buttonClasses({ variant: 'dark' })}>Start shopping</a>}>
            Products from your orders show up here, so reordering takes one click.
          </EmptyState>
        ) : (
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((x) => {
              const href = sp(`/product/${encodeURIComponent(x.productId)}`);
              const p = x.product;
              const title = p?.title ?? x.title;
              return (
                <li key={x.productId} className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3">
                  <a href={href} tabIndex={-1} aria-hidden className={cn('block', x.availability !== 'available' && 'opacity-50')}>
                    <ProductFrame src={p?.image ?? x.image} aspect="1/1" />
                  </a>
                  <a href={href} className="line-clamp-2 text-[14px] font-semibold leading-snug text-ink no-underline hover:underline">
                    {title}
                  </a>
                  <span className="text-[12px] text-ink-3">
                    Last bought {longDate(new Date(x.lastBoughtAt), store)}
                    {x.orders > 1 ? ` · ${x.orders} orders` : ''}
                  </span>
                  <div className="mt-auto flex flex-col gap-2">
                    {p && x.availability === 'available' ? (
                      <>
                        <strong className="text-[16px] tabular-nums">{formatMoney(toStoreMinor(p.priceMinor, cur, p.curBase), cur)}</strong>
                        <BuyAgainButton productId={p.id} title={title} label="Add to cart" block />
                      </>
                    ) : (
                      <>
                        <span className="text-[13px] font-medium text-ink-2">{UNAVAILABLE[x.availability as keyof typeof UNAVAILABLE]}</span>
                        <a href={sp(`/s?k=${encodeURIComponent(shortTitle(title, 3))}`)} className={buttonClasses({ variant: 'secondary', size: 'sm', block: true })}>
                          See similar
                        </a>
                      </>
                    )}
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
