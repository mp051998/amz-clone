import type { RankedProduct } from '@/lib/decision/types';
import { shortTitle } from '@/lib/decision/verdict';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { toStoreMinor } from '@/lib/fx';
import { cn } from '../lib/cn';
import type { Store } from '../lib/store';
import { MatchBadge, TopPickBadge, Kicker } from '../decision/Badges';
import { CheckList } from '../decision/CheckList';
import { CompareToggle } from '../decision/Compare';
import { ProductFrame } from '../decision/ProductFrame';
import { SaveButton } from '../decision/SaveButton';
import { Price } from '../primitives/Price';
import { Stars } from '../primitives/Stars';

export interface ResultCardProps {
  ranked: RankedProduct;
  store: Store;
  /** #1 card gets "Top pick for you" and an ink border. */
  top?: boolean;
  saved: boolean;
  /** fallback "Best for" when the insight has none (the preset's phrase). */
  bestForFallback?: string;
  /** show the match badge (off for plain price/rating sorts). */
  showMatch?: boolean;
  priority?: boolean;
}

/** Store-aware delivery promise from the store's free-delivery threshold. */
export function deliveryLine(store: Store, priceMinor: number, stock: number): string {
  if (stock <= 0) return 'Currently unavailable';
  const threshold = store.delivery.freeThresholdMinor;
  if (priceMinor >= threshold) return 'FREE delivery tomorrow';
  return `Delivery tomorrow · FREE over ${formatMoney(threshold, store.currency.code)}`;
}

/** Ranked search result card (prototype Search screen; design.md §5 Why it's here). */
export function ResultCard({ ranked: r, store, top = false, saved, bestForFallback = '', showMatch = true, priority = false }: ResultCardProps) {
  const p = r.product;
  const cur = store.currency.code;
  const href = storePath(store, `/product/${p.id}`);
  const price = toStoreMinor(p.priceMinor, cur, p.curBase);
  const list = p.listMinor ? toStoreMinor(p.listMinor, cur, p.curBase) : undefined;
  const bestFor = r.insight?.bestFor || bestForFallback;
  return (
    <article className={cn('flex flex-col gap-3 rounded-card border bg-surface p-4', top ? 'border-ink' : 'border-line')}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        {showMatch ? <MatchBadge match={r.match} /> : <span />}
        {top ? <TopPickBadge /> : null}
      </div>
      <a href={href} tabIndex={-1} aria-hidden className="block">
        <ProductFrame src={p.image} alt="" priority={priority} />
      </a>
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-[18px] font-semibold leading-tight">
          <a href={href} className="line-clamp-3 text-ink no-underline hover:underline">{p.title}</a>
        </h3>
        <span className="flex flex-wrap items-center gap-1 text-[14px] text-ink-2">
          <Stars rating={p.rating} size={14} />
          <span>{p.rating.toFixed(1)} · {p.reviewCount.toLocaleString('en-US')} reviews</span>
        </span>
      </div>
      <Price minor={price} currency={cur} listMinor={list} listLabel={store.id === 'IN' ? store.pricing.listLabel : undefined} size={22} />
      <span className="text-[13px] text-ink-2">
        <span className="mr-1.5 rounded-[3px] bg-ink px-[5px] py-px text-[11px] font-bold uppercase text-white">{store.membership.name}</span>
        {deliveryLine(store, price, p.stock)}
      </span>
      {r.why.length || r.warn ? (
        <div className="flex flex-col gap-1.5 border-t border-line-2 pt-3">
          <Kicker className="font-semibold">Why it&apos;s here</Kicker>
          <CheckList good={r.why} warn={r.warn} />
        </div>
      ) : null}
      {bestFor ? (
        <span className="text-[14px]"><strong>Best for:</strong> {bestFor}</span>
      ) : null}
      <div className="mt-auto flex gap-2">
        <CompareToggle item={{ id: p.id, name: shortTitle(p.title, 6), image: p.image, category: p.category, categoryName: p.categoryName }} />
        <SaveButton productId={p.id} saved={saved} name={p.title} market={store.id} />
      </div>
    </article>
  );
}
