'use client';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { addBundle } from '@/app/actions/cart';
import type { CurrencyCode } from '@/lib/contracts';
import { formatMoney } from '@/lib/marketplaces';
import { ProductFrame } from '../decision/ProductFrame';
import { cn } from '../lib/cn';
import { buttonClasses } from '../primitives/Button';

export interface BundleEntry {
  id: string;
  title: string;
  image: string;
  href: string;
  /** in the store's currency */
  priceMinor: number;
  /** the product the page is for */
  current?: boolean;
}

const WORDS = ['', '', 'both', 'all three'];

function AddButton({ n }: { n: number }) {
  const { pending } = useFormStatus();
  const label = n === 0 ? 'Choose items to add' : n === 1 ? 'Add to cart' : `Add ${WORDS[n] ?? `all ${n}`} to cart`;
  return (
    <button type="submit" disabled={pending || n === 0} aria-busy={pending || undefined} className={buttonClasses({ variant: 'primary' })}>
      {pending ? 'Adding…' : label}
    </button>
  );
}

/**
 * PDP "Frequently bought together": the product and up to two more, each ticked to start with.
 * The total and the button follow the ticks; the ticked ones (`id`) go to the cart in one go.
 */
export function BoughtTogether({ productId, items, currency }: { productId: string; items: BundleEntry[]; currency: CurrencyCode }) {
  const [picked, setPicked] = useState(() => new Set(items.map((i) => i.id)));
  const chosen = items.filter((i) => picked.has(i.id));
  const total = chosen.reduce((sum, i) => sum + i.priceMinor, 0);
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form action={addBundle} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 md:flex-row md:items-center md:gap-6">
      <input type="hidden" name="from" value={productId} />
      <ol aria-hidden className="m-0 flex list-none items-center gap-1.5 p-0">
        {items.map((i, n) => (
          <li key={i.id} className="flex items-center gap-1.5">
            {n > 0 ? <span className="text-[22px] leading-none text-ink-3">+</span> : null}
            <a href={i.href} tabIndex={-1} className={cn('block w-[84px] transition-opacity sm:w-[112px]', !picked.has(i.id) && 'opacity-35')}>
              <ProductFrame src={i.image} aspect="1/1" inset="8%" />
            </a>
          </li>
        ))}
      </ol>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((i) => (
            <li key={i.id} className="flex items-start gap-2.5 text-[14px] leading-snug">
              <input
                id={`fbt-${i.id}`}
                type="checkbox"
                name="id"
                value={i.id}
                checked={picked.has(i.id)}
                onChange={() => toggle(i.id)}
                className="mt-0.5 h-4 w-4 flex-none accent-ink"
              />
              <label htmlFor={`fbt-${i.id}`} className="min-w-0">
                {i.current ? <strong className="font-semibold">This item: </strong> : null}
                {i.title}
                <span className="whitespace-nowrap font-semibold tabular-nums"> {formatMoney(i.priceMinor, currency)}</span>
              </label>
              {i.current ? null : (
                <a href={i.href} className="ml-auto flex-none text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink" aria-label={`View ${i.title}`}>
                  View
                </a>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[15px]" aria-live="polite">
            Total price: <strong className="font-semibold tabular-nums">{formatMoney(total, currency)}</strong>
          </span>
          <AddButton n={chosen.length} />
        </div>
      </div>
    </form>
  );
}
