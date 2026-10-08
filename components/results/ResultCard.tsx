import type { RankedProduct } from '@/lib/decision/types';
import { shortTitle } from '@/lib/decision/verdict';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { toStoreMinor } from '@/lib/fx';
import { qtyDiscountText } from '@/lib/qty-discount';
import { unitPriceText } from '@/lib/unit-price';
import { releaseOf } from '@/lib/pre-order';
import type { VariantSummary } from '@/lib/variants';
import { cn } from '../lib/cn';
import type { Store } from '../lib/store';
import { releaseDate } from '../orders/format';
import { MatchBadge, TopPickBadge, Kicker } from '../decision/Badges';
import { CheckList } from '../decision/CheckList';
import { CompareToggle } from '../decision/Compare';
import { ProductFrame } from '../decision/ProductFrame';
import { SaveButton } from '../decision/SaveButton';
import { QuickAdd } from '../deals/QuickAdd';
import { VariantSwatches } from '../product/VariantSwatches';
import { Badge } from '../primitives/Badge';
import { Price } from '../primitives/Price';
import { Stars } from '../primitives/Stars';
import { ClimateBadge } from '../product/ClimatePledge';

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
  /** the product's variant group (other colours, sizes), when it has one. */
  variants?: VariantSummary;
  /** the standard delivery day ("Tomorrow, October 8") and whether the shopper is a Plus member. */
  delivery?: ResultDelivery;
  /** the product's coupon, percent off (applied on the product page or in the cart). */
  couponPct?: number;
}

export interface ResultDelivery {
  day: string;
  member?: boolean;
}

/**
 * Store-aware delivery promise: free over the store's threshold, and always for Plus members. A
 * pre-order (`release` still to come) says when it comes out instead.
 */
export function deliveryLine(store: Store, priceMinor: number, stock: number, delivery: ResultDelivery = { day: 'tomorrow' }, release?: string | null): string {
  if (stock <= 0) return 'Currently unavailable';
  if (release) return `Pre-order · releases ${releaseDate(new Date(release), store)}`;
  const threshold = store.delivery.freeThresholdMinor;
  if (delivery.member || priceMinor >= threshold) return `FREE delivery ${delivery.day}`;
  return `Delivery ${delivery.day} · FREE over ${formatMoney(threshold, store.currency.code)}`;
}

/** Ranked search result card (prototype Search screen; design.md §5 Why it's here). */
export function ResultCard({ ranked: r, store, top = false, saved, bestForFallback = '', showMatch = true, priority = false, variants, delivery, couponPct }: ResultCardProps) {
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
        {p.badge ? <Badge tone="dark" className="self-start">{p.badge}</Badge> : null}
        <h3 className="m-0 text-[18px] font-semibold leading-tight">
          <a href={href} className="line-clamp-3 text-ink no-underline hover:underline">{p.title}</a>
        </h3>
        <span className="flex flex-wrap items-center gap-1 text-[14px] text-ink-2">
          <Stars rating={p.rating} size={14} />
          <span>{p.rating.toFixed(1)} · {p.reviewCount.toLocaleString('en-US')} reviews</span>
        </span>
        {p.boughtPastMonth ? <span className="text-[13px] text-ink-2">{p.boughtPastMonth}</span> : null}
      </div>
      {variants ? <VariantSwatches variants={variants} currentId={p.id} store={store} /> : null}
      <div className="flex flex-col gap-0.5">
        <Price minor={price} currency={cur} listMinor={list} listLabel={store.id === 'IN' ? store.pricing.listLabel : undefined} size={22} unitText={p.unit ? unitPriceText(price, cur, p.unit) : undefined} />
        {p.deal && !/deal/i.test(p.badge ?? '') ? <span className="text-[13px] font-semibold text-warn-strong">Limited-time deal</span> : null}
        {couponPct ? (
          <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
            <span className="rounded-tag bg-good-bg px-1.5 py-0.5 text-[12px] font-bold text-good-strong">Coupon</span>
            Save {couponPct}% with coupon
          </span>
        ) : null}
        {p.qtyDiscount ? <span className="text-[13px] text-ink-2">{qtyDiscountText(p.qtyDiscount)}</span> : null}
      </div>
      <span className="text-[13px] text-ink-2">
        <span className="mr-1.5 rounded-[3px] bg-ink px-[5px] py-px text-[11px] font-bold uppercase text-on-ink">{store.membership.name}</span>
        {deliveryLine(store, price, p.stock, delivery, releaseOf(p))}
      </span>
      {p.climate?.length ? <ClimateBadge /> : null}
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
        {p.stock > 0 ? <QuickAdd productId={p.id} name={p.title} className="ml-auto" optionsHref={p.sizes ? href : undefined} /> : null}
      </div>
    </article>
  );
}
