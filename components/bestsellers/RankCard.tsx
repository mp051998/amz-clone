import type { Product } from '@/lib/types';
import type { Store } from '../lib/store';
import { storePath } from '@/lib/marketplace';
import { toStoreMinor } from '@/lib/fx';
import { Price } from '../primitives/Price';
import { ProductFrame } from '../decision/ProductFrame';
import { CompareToggle } from '../decision/Compare';
import { SaveButton } from '../decision/SaveButton';
import { QuickAdd } from '../deals/QuickAdd';

export interface RankCardProps {
  product: Product;
  store: Store;
  /** position in the list; rendered as a mono "#1". Omit for unranked lists. */
  rank?: number;
  /** mono kicker shown when there is no rank (e.g. "New"). */
  tag?: string;
  saved?: boolean;
}

/**
 * Product card for Bestsellers / New & trending (design.md §5): white card, hatched ProductFrame, mono
 * "#N" rank, name, ★ rating, Price, accent "N% off" when on deal, then Compare · Save · quick add.
 * Horizontal on phones (image left) so a 40-item list stays scannable; stacked from `sm`.
 */
export function RankCard({ product: p, store, rank, tag, saved = false }: RankCardProps) {
  const href = storePath(store, `/product/${p.id}`);
  const cur = store.currency.code;
  const price = toStoreMinor(p.priceMinor, cur, p.curBase);
  const list = p.listMinor ? toStoreMinor(p.listMinor, cur, p.curBase) : undefined;
  const pct = p.dealPct ?? (list && list > price ? Math.round((1 - price / list) * 100) : 0);
  const label = rank != null ? `#${rank}` : tag;
  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3.5 transition-colors hover:border-ink">
      <div className="flex gap-3.5 sm:flex-col sm:gap-2.5">
        <div className="w-[112px] flex-none sm:w-full">
          <a href={href} tabIndex={-1} aria-hidden className="block">
            <ProductFrame src={p.image} alt="" aspect="4/3" />
          </a>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-h-[22px] items-center justify-between gap-2">
            {label ? (
              <span className="font-mono text-[14px] font-semibold leading-none text-ink">
                {rank != null ? <span className="sr-only">Rank </span> : null}{label}
              </span>
            ) : <span />}
            {pct > 0 ? <span className="rounded-tag bg-accent px-[7px] py-[3px] text-[12px] font-bold leading-none text-on-accent">{pct}% off</span> : null}
          </div>
          <a href={href} className="line-clamp-2 text-[16px] font-semibold leading-tight text-ink no-underline hover:text-accent-ink">
            {p.title}
          </a>
          <span className="text-[13px] text-ink-2">
            <span aria-hidden className="text-star">★</span> {p.rating.toFixed(1)}
            <span className="text-ink-3"> · {p.reviewCount.toLocaleString('en-US')} ratings</span>
          </span>
          <Price minor={price} currency={cur} listMinor={list} showSavings={false} size={18} />
        </div>
      </div>
      <div className="mt-auto flex items-center gap-2 border-t border-line-2 pt-3">
        <CompareToggle item={{ id: p.id, name: p.title, image: p.image, category: p.category, categoryName: p.categoryName }} />
        <SaveButton productId={p.id} saved={saved} name={p.title} />
        <QuickAdd productId={p.id} name={p.title} />
      </div>
    </article>
  );
}
