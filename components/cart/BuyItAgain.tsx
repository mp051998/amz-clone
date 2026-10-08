import { ProductFrame } from '@/components/decision';
import { BuyAgainButton } from '@/components/orders/BuyAgainButton';
import { longDate } from '@/components/orders/format';
import type { BuyAgainItem } from '@/lib/buy-again';
import type { PublicMarketplace } from '@/lib/contracts';
import { toStoreMinor } from '@/lib/fx';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import type { Product } from '@/lib/types';
import { cn } from '../lib/cn';

export interface BuyItAgainProps {
  /** what the shopper bought before and can buy now, most recent first */
  items: (BuyAgainItem & { product: Product })[];
  /** they've bought more than is shown here (all of it is on Your Orders › Buy again) */
  more: boolean;
  store: PublicMarketplace;
  /** false under the cart's "Saved for later | Buy it again" tabs, where the tab names the list */
  titled?: boolean;
}

/** The cart's "Buy it again": things bought before, at today's price, back in the cart in one tap. */
export function BuyItAgain({ items, more, store, titled = true }: BuyItAgainProps) {
  if (!items.length) return null;
  const sp = (path: string) => storePath(store, path);
  const cur = store.currency.code;
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="again-h">
      <h2 id="again-h" className={cn('m-0 text-[20px] font-semibold', !titled && 'sr-only')}>
        Buy it again
      </h2>
      <ul className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0">
        {items.map((x) => {
          const p = x.product;
          const href = sp(`/product/${encodeURIComponent(p.id)}`);
          return (
            <li key={p.id} className="flex flex-wrap gap-3.5 border-t border-line-2 p-4 first:border-t-0">
              <a href={href} className="w-[72px] flex-none" tabIndex={-1} aria-hidden>
                <ProductFrame src={p.image} alt="" aspect="1/1" />
              </a>
              <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
                <div className="flex justify-between gap-3">
                  <a href={href} className="line-clamp-2 text-[16px] font-semibold leading-[1.25] text-ink no-underline">{p.title}</a>
                  <strong className="flex-none text-[16px] tabular-nums">{formatMoney(toStoreMinor(p.priceMinor, cur, p.curBase), cur)}</strong>
                </div>
                <span className="text-[13px] text-ink-3">
                  Last bought {longDate(new Date(x.lastBoughtAt), store)}
                  {x.orders > 1 ? ` · ${x.orders} orders` : ''}
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-2.5">
                  <BuyAgainButton productId={p.id} title={p.title} label="Add to cart" optionsHref={p.sizes ? href : undefined} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {more ? (
        <a href={sp('/orders/buy-again')} className="self-start text-[14px] text-ink underline underline-offset-2 hover:text-accent-ink">
          See everything you&rsquo;ve bought before
        </a>
      ) : null}
    </section>
  );
}
