import { ProductFrame } from '@/components/decision';
import { isBackInStock } from '@/lib/data/collections';
import type { CollectionItem } from '@/lib/decision/types';
import { formatMoney } from '@/lib/marketplaces';
import { cn } from '../lib/cn';
import { SavedItemActions } from './CartActions';

export interface SavedForLaterProps {
  collectionId: string;
  items: CollectionItem[];
  /** store-prefixed path */
  sp: (path: string) => string;
  /** false under the cart's "Saved for later | Buy it again" tabs, where the tab names the list */
  titled?: boolean;
}

/** The cart's "Saved for later" list: each item at today's price, back into the cart in one tap. */
export function SavedForLater({ collectionId, items, sp, titled = true }: SavedForLaterProps) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="later-h">
      <h2 id="later-h" className={cn('m-0 text-[20px] font-semibold', !titled && 'sr-only')}>
        Saved for later <span className="font-normal text-ink-3">({items.length} {items.length === 1 ? 'item' : 'items'})</span>
      </h2>
      <ul className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0">
        {items.map((item) => {
          const { product: p, savedPriceMinor } = item;
          const href = sp(`/product/${encodeURIComponent(p.id)}`);
          const money = (minor: number) => formatMoney(minor, p.curBase);
          const drop = p.archived ? 0 : savedPriceMinor - p.priceMinor;
          const canMove = !p.archived && p.stock > 0;
          return (
            <li key={p.id} className="flex flex-wrap gap-3.5 border-t border-line-2 p-4 first:border-t-0">
              <a href={href} className={`w-[72px] flex-none${canMove ? '' : ' opacity-50'}`} tabIndex={-1} aria-hidden>
                <ProductFrame src={p.image} alt="" aspect="1/1" />
              </a>
              <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
                <div className="flex justify-between gap-3">
                  <a href={href} className="line-clamp-2 text-[16px] font-semibold leading-[1.25] text-ink no-underline">{p.title}</a>
                  {p.archived ? null : <strong className="flex-none text-[16px] tabular-nums">{money(p.priceMinor)}</strong>}
                </div>
                {p.archived ? (
                  <span className="text-[14px] font-semibold text-warn">No longer available</span>
                ) : p.stock === 0 ? (
                  <span className="text-[14px] font-semibold text-warn">Out of stock</span>
                ) : isBackInStock(item) ? (
                  <span className="text-[14px] font-semibold text-good-strong">Back in stock{p.stock <= 10 ? ` · only ${p.stock} left` : ''}</span>
                ) : (
                  <span className="text-[14px] text-ink-2">{p.stock <= 10 ? `Only ${p.stock} left` : 'In stock'}</span>
                )}
                {drop > 0 ? (
                  <span className="self-start rounded-chip bg-good-bg px-2 py-1 text-[13px] font-semibold text-good-strong">↓ {money(drop)} less than when you saved it</span>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-2.5">
                  <SavedItemActions collectionId={collectionId} productId={p.id} name={p.title} canMove={canMove} optionsHref={p.sizes ? href : undefined} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
