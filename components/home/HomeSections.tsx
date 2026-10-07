import type { ReactNode } from 'react';
import type { BackInStock, PriceDrop } from '@/lib/data/collections';
import type { BuyAgainItem } from '@/lib/buy-again';
import type { HomeDeal, HomePick } from '@/lib/home-content';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { toStoreMinor } from '@/lib/fx';
import type { Product } from '@/lib/types';
import type { Store } from '../lib/store';
import { ProductFrame } from '../decision/ProductFrame';
import { BuyAgainButton } from '../orders/BuyAgainButton';

/** Section wrapper: 22px title + optional meta on the right (design.md §3 Section title). */
export function HomeSection({ title, meta, link, children, id }: { title: string; meta?: string; link?: { href: string; label: string }; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id={id} className="m-0 text-[22px] font-semibold">{title}</h2>
        {meta || link ? (
          <span className="flex items-baseline gap-3 text-[14px]">
            {meta ? <span className="text-ink-3">{meta}</span> : null}
            {link ? <a href={link.href} className="text-ink underline underline-offset-2">{link.label}</a> : null}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function money(p: Product, store: Store, minor = p.priceMinor) {
  return formatMoney(toStoreMinor(minor, store.currency.code, p.curBase), store.currency.code);
}

function Rating({ p }: { p: Product }) {
  return (
    <span className="whitespace-nowrap">
      <span aria-hidden className="text-star">★</span> {p.rating.toFixed(1)}
      <span className="sr-only"> out of 5 stars</span>
    </span>
  );
}

/** Continue shopping: horizontally scrolling recently-viewed cards. */
export function ContinueRow({ products, store, kicker = 'Viewed recently' }: { products: Product[]; store: Store; /** the small line over each title, or how to word it for each product */ kicker?: string | ((p: Product) => string) }) {
  return (
    <ul className="no-scrollbar relative m-0 flex list-none gap-3.5 overflow-x-auto p-0 pb-1.5">
      {products.map((p) => (
        <li key={p.id} className="flex-[0_0_230px]">
          <a
            href={storePath(store, `/product/${p.id}`)}
            className="flex h-full flex-col gap-2.5 rounded-card border border-line bg-surface p-3 text-ink no-underline transition-colors hover:border-ink hover:text-ink"
          >
            <ProductFrame src={p.image} alt="" />
            <span className="font-mono text-[12px] text-ink-3">{typeof kicker === 'function' ? kicker(p) : kicker}</span>
            <span className="line-clamp-2 text-[16px] font-semibold leading-tight">{p.title}</span>
            <span className="mt-auto flex items-center justify-between text-[14px]">
              <strong className="text-[16px] tabular-nums">{money(p, store)}</strong>
              <Rating p={p} />
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Picks grid: reason chip, frame, name, ★ · reviews, price + best for. */
export function PickGrid({ picks, store }: { picks: HomePick[]; store: Store }) {
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3.5 p-0">
      {picks.map(({ product: p, reason, bestFor }) => {
        const href = storePath(store, `/product/${p.id}`);
        return (
          <li key={p.id}>
            <article className="flex h-full flex-col gap-2.5 rounded-card border border-line bg-surface p-3.5">
              <span className="self-start rounded-chip bg-surface-2 px-2 py-1.5 text-[13px] text-ink-2">{reason}</span>
              <a href={href} tabIndex={-1} aria-hidden className="block">
                <ProductFrame src={p.image} alt="" />
              </a>
              <a href={href} className="line-clamp-2 text-[17px] font-semibold leading-tight text-ink no-underline hover:underline">{p.title}</a>
              <span className="text-[14px] text-ink-2">
                <Rating p={p} /> · {p.reviewCount.toLocaleString('en-US')} reviews
              </span>
              <div className="mt-auto flex items-center justify-between gap-2">
                <strong className="text-[18px] tabular-nums">{money(p, store)}</strong>
                {bestFor ? <span className="text-right text-[13px] text-ink-2">{bestFor}</span> : null}
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

/** Deal cards: accent "N% OFF", name, price + struck list, ★, ends-soon line. */
export function DealGrid({ deals, store }: { deals: HomeDeal[]; store: Store }) {
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3.5 p-0">
      {deals.map(({ product: p, ends }) => {
        const off = p.listMinor ? Math.round((1 - p.priceMinor / p.listMinor) * 100) : p.dealPct ?? 0;
        return (
          <li key={p.id}>
            <a
              href={storePath(store, `/product/${p.id}`)}
              className="flex h-full items-stretch gap-3.5 rounded-card border border-line bg-surface p-3.5 text-ink no-underline transition-colors hover:border-ink hover:text-ink"
            >
              <div className="min-h-[110px] flex-[0_0_96px]">
                <ProductFrame src={p.image} alt="" aspect="auto" className="h-full min-h-[110px]" label="product" />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                {off > 0 ? <span className="self-start rounded-tag bg-accent text-on-accent px-[7px] py-[3px] text-[13px] font-bold">{off}% OFF</span> : null}
                <span className="line-clamp-2 text-[15px] font-semibold leading-tight">{p.title}</span>
                <span className="flex flex-wrap items-baseline gap-2">
                  <strong className="text-[18px] tabular-nums">{money(p, store)}</strong>
                  {p.listMinor ? (
                    <s className="text-[13px] text-ink-3 tabular-nums">
                      <span className="sr-only">was </span>{money(p, store, p.listMinor)}
                    </s>
                  ) : null}
                </span>
                <span className="text-[13px]"><Rating p={p} /></span>
                <span className="text-[13px] font-semibold text-warn-strong">{ends}</span>
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Saved products that got cheaper: "↓ $X since you saved", today's price, the saved price struck. */
export function SavedDropGrid({ drops, store }: { drops: PriceDrop[]; store: Store }) {
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3.5 p-0">
      {drops.map(({ product: p, savedPriceMinor, dropMinor }) => (
        <li key={p.id}>
          <a
            href={storePath(store, `/product/${p.id}`)}
            className="flex h-full items-stretch gap-3.5 rounded-card border border-line bg-surface p-3.5 text-ink no-underline transition-colors hover:border-ink hover:text-ink"
          >
            <div className="min-h-[110px] flex-[0_0_96px]">
              <ProductFrame src={p.image} alt="" aspect="auto" className="h-full min-h-[110px]" label="product" />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="self-start rounded-chip bg-good-bg px-2 py-1 text-[13px] font-semibold text-good-strong">
                ↓ {money(p, store, dropMinor)} since you saved
              </span>
              <span className="line-clamp-2 text-[15px] font-semibold leading-tight">{p.title}</span>
              <span className="flex flex-wrap items-baseline gap-2">
                <strong className="text-[18px] tabular-nums">{money(p, store)}</strong>
                <s className="text-[13px] text-ink-3 tabular-nums">
                  <span className="sr-only">saved at </span>{money(p, store, savedPriceMinor)}
                </s>
              </span>
              <span className="text-[13px]"><Rating p={p} /></span>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Saved products that were sold out and can be bought again: a "Back in stock" chip, today's price (the saved price struck if it's cheaper now). */
export function SavedBackGrid({ items, store }: { items: BackInStock[]; store: Store }) {
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3.5 p-0">
      {items.map(({ product: p, savedPriceMinor }) => (
        <li key={p.id}>
          <a
            href={storePath(store, `/product/${p.id}`)}
            className="flex h-full items-stretch gap-3.5 rounded-card border border-line bg-surface p-3.5 text-ink no-underline transition-colors hover:border-ink hover:text-ink"
          >
            <div className="min-h-[110px] flex-[0_0_96px]">
              <ProductFrame src={p.image} alt="" aspect="auto" className="h-full min-h-[110px]" label="product" />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="self-start rounded-chip bg-good-bg px-2 py-1 text-[13px] font-semibold text-good-strong">Back in stock</span>
              <span className="line-clamp-2 text-[15px] font-semibold leading-tight">{p.title}</span>
              <span className="flex flex-wrap items-baseline gap-2">
                <strong className="text-[18px] tabular-nums">{money(p, store)}</strong>
                {savedPriceMinor > p.priceMinor ? (
                  <s className="text-[13px] text-ink-3 tabular-nums">
                    <span className="sr-only">saved at </span>{money(p, store, savedPriceMinor)}
                  </s>
                ) : null}
              </span>
              <span className="text-[13px]"><Rating p={p} /></span>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** "Buy again": things you've ordered that are in stock now, one click back into the cart. */
export function BuyAgainGrid({ items, store }: { items: (BuyAgainItem & { product: Product })[]; store: Store }) {
  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
      {items.map(({ product: p, orders }) => {
        const href = storePath(store, `/product/${p.id}`);
        return (
          <li key={p.id} className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3">
            <a href={href} tabIndex={-1} aria-hidden className="block">
              <ProductFrame src={p.image} alt="" aspect="1/1" label="product" />
            </a>
            <a href={href} className="line-clamp-2 text-[14px] font-semibold leading-snug text-ink no-underline hover:underline">{p.title}</a>
            <span className="flex flex-wrap items-baseline gap-2">
              <strong className="text-[16px] tabular-nums">{money(p, store)}</strong>
              {orders > 1 ? <span className="text-[12px] text-ink-3">Bought {orders} times</span> : null}
            </span>
            <div className="mt-auto flex">
              <BuyAgainButton productId={p.id} title={p.title} label="Add to cart" block optionsHref={p.sizes ? href : undefined} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
