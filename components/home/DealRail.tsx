'use client';

import { useRef } from 'react';
import type { Product } from '../../lib/catalog';
import type { Store } from '../lib/store';
import { storePath } from '../../lib/marketplace';
import { toStoreMinor } from '../../lib/fx';
import { Price } from '../primitives/Price';
import { IconChevronRight } from '../icons/index';

export interface DealRailProps {
  title: string;
  products: readonly Product[];
  store: Store;
}

/** Compact deal strip with touch scrolling and keyboard-accessible scroll controls. */
export function DealRail({ title, products, store }: DealRailProps) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (direction: number) => {
    const element = track.current;
    element?.scrollBy({ left: direction * 0.85 * element.clientWidth, behavior: 'smooth' });
  };
  const currency = store.currency.code;

  return (
    <section aria-labelledby={`${title}-heading`} className="bg-white p-5 shadow-[0_1px_2px_rgba(15,17,17,0.15)]">
      <h2 id={`${title}-heading`} className="mb-3 text-[21px] font-bold text-ink">{title}</h2>
      <div className="relative">
        <div ref={track} aria-label={`${title} products`} className="flex touch-pan-x gap-3 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {products.map((product) => (
            <a key={product.id} href={storePath(store, `/product/${product.id}`)} className="group w-[145px] shrink-0">
              <div className="flex h-[145px] items-center justify-center overflow-hidden bg-white p-2">
                <img src={product.image} alt={product.title} className="h-full w-full object-contain transition group-hover:scale-[1.04]" loading="lazy" />
              </div>
              {product.deal && product.dealPct ? <span className="mt-2 inline-block rounded-[3px] bg-badge-deal px-1.5 py-0.5 text-[12px] font-bold text-white">-{product.dealPct}%</span> : null}
              <div className="mt-1">
                <Price minor={toStoreMinor(product.priceMinor, currency, product.curBase)} currency={currency} listMinor={product.listMinor ? toStoreMinor(product.listMinor, currency, product.curBase) : undefined} size={18} />
              </div>
              <p className="mt-0.5 line-clamp-2 text-[13px] leading-[17px] text-ink-2 group-hover:text-link-hover">{product.title}</p>
            </a>
          ))}
        </div>
        <button type="button" aria-label="Scroll left" onClick={() => scroll(-1)} className="absolute -left-2 top-[60px] hidden h-14 w-9 items-center justify-center rounded-[4px] border border-line bg-white shadow-md hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-teal md:flex">
          <IconChevronRight width={20} height={20} className="rotate-180" />
        </button>
        <button type="button" aria-label="Scroll right" onClick={() => scroll(1)} className="absolute -right-2 top-[60px] hidden h-14 w-9 items-center justify-center rounded-[4px] border border-line bg-white shadow-md hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link-teal md:flex">
          <IconChevronRight width={20} height={20} />
        </button>
      </div>
    </section>
  );
}
