'use client';
import { useRef } from 'react';
import type { Product } from '@/lib/catalog';
import type { Store } from '../lib/store';
import { storePath } from '@/lib/marketplace';
import { toStoreMinor } from '@/lib/fx';
import { Price } from '../primitives/Price';
import { IconChevronRight } from '../icons/index';

export interface ProductRailProps {
  title: string;
  seeMoreHref: string;
  products: Product[];
  store: Store;
}

/** Titled horizontal product strip with scroll arrows (design.md §5 Home rails). */
export function ProductRail({ title, seeMoreHref, products, store }: ProductRailProps) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (d: number) => track.current?.scrollBy({ left: d * 0.85 * track.current.clientWidth, behavior: 'smooth' });
  const cur = store.currency.code;

  return (
    <section className="bg-white p-5 shadow-[0_1px_2px_rgba(15,17,17,0.15)]">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[21px] font-bold text-ink">{title}</h2>
        <a href={seeMoreHref} className="text-[13px] text-link-teal hover:text-brand-count hover:underline">See more</a>
      </div>
      <div className="relative">
        <div ref={track} className="flex gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {products.map((p) => (
            <a key={p.id} href={storePath(store, `/product/${p.id}`)} className="group w-[170px] shrink-0">
              <div className="flex h-[170px] items-center justify-center overflow-hidden bg-surface-4 p-2">
                <img src={p.image} alt={p.title} className="h-full w-full object-contain transition group-hover:scale-[1.04]" loading="lazy" />
              </div>
              {p.deal && p.dealPct ? (
                <span className="mt-2 inline-block rounded-[3px] bg-badge-deal px-1.5 py-0.5 text-[12px] font-bold text-white">-{p.dealPct}%</span>
              ) : null}
              <div className="mt-1">
                <Price minor={toStoreMinor(p.priceMinor, cur, p.curBase)} currency={cur} listMinor={p.listMinor ? toStoreMinor(p.listMinor, cur, p.curBase) : undefined} size={18} />
              </div>
              <p className="mt-0.5 line-clamp-2 text-[13px] leading-[17px] text-ink-2 group-hover:text-link-hover">{p.title}</p>
            </a>
          ))}
        </div>
        <button type="button" aria-label="Scroll left" onClick={() => scroll(-1)}
          className="absolute -left-2 top-[70px] hidden h-14 w-9 items-center justify-center rounded-[4px] border border-line bg-white shadow-md hover:bg-surface-2 md:flex">
          <IconChevronRight width={20} height={20} className="rotate-180" />
        </button>
        <button type="button" aria-label="Scroll right" onClick={() => scroll(1)}
          className="absolute -right-2 top-[70px] hidden h-14 w-9 items-center justify-center rounded-[4px] border border-line bg-white shadow-md hover:bg-surface-2 md:flex">
          <IconChevronRight width={20} height={20} />
        </button>
      </div>
    </section>
  );
}
