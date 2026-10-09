'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { IconClose } from '@/components/icons';

export interface ProductSummaryProps {
  title: string;
  brand: string | null;
  /** "4.5 out of 5 stars, 1,234 ratings"; null with no ratings yet */
  ratingText: string | null;
  /** the page's own price line; null when it isn't on sale */
  price: ReactNode | null;
  taxNote?: string | null;
  availability: string;
  /** the link to other sellers' offers, when there are any */
  otherSellers?: { label: string; href: string } | null;
  bullets: string[];
  description: string | null;
  /** what it comes in: Colour, Size… with each choice */
  options: { name: string; values: string[] }[];
}

const ID = 'product-summary';

/**
 * Amazon's "Product summary": the page's key facts (price, availability, about this item,
 * description, options) in one dialog, for screen reader and keyboard users. Opened from a link
 * Tab reaches first in the main content, or shift + alt + D (the "Skip to" box presses it). A native
 * popover; focus moves to its heading when it opens.
 */
export function ProductSummary({ title, brand, ratingText, price, taxNote, availability, otherSellers, bullets, description, options }: ProductSummaryProps) {
  const box = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === 'open') heading.current?.focus();
    };
    el.addEventListener('toggle', onToggle);
    return () => el.removeEventListener('toggle', onToggle);
  }, []);

  const h3 = 'm-0 text-[15px] font-semibold';
  return (
    <div>
      <button
        type="button"
        popoverTarget={ID}
        data-shortcut="product-summary"
        className="sr-only focus:not-sr-only focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-input focus:border focus:border-line focus:bg-surface focus:px-3 focus:text-[14px] focus:text-ink"
      >
        Product summary presents key product information
      </button>
      <div
        ref={box}
        id={ID}
        popover="auto"
        role="dialog"
        aria-labelledby={`${ID}-h`}
        className="m-auto max-h-[min(85vh,720px)] w-[min(560px,calc(100vw-32px))] overflow-y-auto rounded-card border border-line bg-surface p-5 text-ink shadow-lg backdrop:bg-scrim"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 ref={heading} id={`${ID}-h`} tabIndex={-1} className="m-0 text-[17px] font-semibold leading-snug outline-none">
            Product summary: {title}
          </h2>
          <button type="button" popoverTarget={ID} popoverTargetAction="hide" aria-label="Close" className="-m-1 flex-none rounded-full p-1 text-ink-2 hover:text-ink">
            <IconClose width={18} height={18} />
          </button>
        </div>
        {brand ? <p className="m-0 mt-1 text-[14px] text-ink-2">From {brand}</p> : null}
        {ratingText ? <p className="m-0 mt-1 text-[14px] text-ink-2">{ratingText}</p> : null}

        <div className="mt-4 flex flex-col gap-4 text-[14px]">
          <section className="flex flex-col gap-1">
            <h3 className={h3}>Price</h3>
            {price ?? <p className="m-0 text-ink-2">Not available to buy right now</p>}
            {price && taxNote ? <p className="m-0 text-[12px] text-ink-3">{taxNote}</p> : null}
            <p className="m-0 text-ink-2">{availability}</p>
          </section>

          {otherSellers ? (
            <section className="flex flex-col gap-1">
              <h3 className={h3}>Purchasing options</h3>
              <a href={otherSellers.href} className="self-start text-ink underline underline-offset-2">{otherSellers.label}</a>
            </section>
          ) : null}

          {bullets.length ? (
            <section className="flex flex-col gap-1">
              <h3 className={h3}>About this item</h3>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-ink-2">
                {bullets.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </section>
          ) : null}

          {description ? (
            <section className="flex flex-col gap-1">
              <h3 className={h3}>Product description</h3>
              <p className="m-0 whitespace-pre-line text-ink-2">{description}</p>
            </section>
          ) : null}

          {options.length ? (
            <section className="flex flex-col gap-2">
              <h3 className={h3}>Options available</h3>
              {options.map((o) => (
                <div key={o.name}>
                  <h4 className="m-0 text-[14px] font-semibold text-ink-2">{o.name}</h4>
                  <p className="m-0 text-ink-2">{o.values.join(', ')}</p>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
