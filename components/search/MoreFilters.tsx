import { DISCOUNTS, SELLER_SEPARATOR, type PricePreset } from '@/lib/search';
import type { Category } from '@/lib/types';
import { cn } from '../lib/cn';
import { Stars } from '../primitives/Stars';

export interface MoreFiltersProps {
  categories: Category[];
  /** effective department (null = all) */
  dept: string | null;
  brandFacets: { name: string; count: number }[];
  brands: string[];
  /** sellers in the search's scope, with counts (empty = no Seller section) */
  sellerFacets?: { name: string; count: number }[];
  sellers?: string[];
  rating?: number;
  deal: boolean;
  /** "Discount": the percentage off picked (undefined = any) */
  minDiscount?: number;
  /** price buckets for the department (empty = no Price section) */
  pricePresets?: PricePreset[];
  /** current price range, minor units (null = open-ended) */
  minPrice?: number | null;
  maxPrice?: number | null;
  /** "Include Out of Stock" is ticked */
  includeOutOfStock?: boolean;
  /** href for the current search with these params changed (null = remove). */
  hrefWith: (patch: Record<string, string | null>) => string;
}

function Box({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cn('flex h-[18px] w-[18px] flex-none items-center justify-center rounded-tag border-[1.5px] border-ink text-[12px] text-on-ink', on ? 'bg-ink' : 'bg-surface')}>
      {on ? '✓' : ''}
    </span>
  );
}

const row = 'flex min-h-9 items-center gap-2 rounded-chip px-1 text-[14px] text-ink no-underline hover:bg-surface-2 hover:text-ink';

/** Link-driven secondary filters (department, brand, seller, price, rating, deals, discount, availability) — SSR, works without JS. */
export function MoreFilters({ categories, dept, brandFacets, brands, sellerFacets = [], sellers = [], rating, deal, minDiscount, pricePresets = [], minPrice = null, maxPrice = null, includeOutOfStock = false, hrefWith }: MoreFiltersProps) {
  const toggleBrand = (name: string) => {
    const set = new Set(brands);
    if (set.has(name)) set.delete(name);
    else set.add(name);
    return hrefWith({ brand: set.size ? [...set].join(',') : null });
  };
  const toggleSeller = (name: string) => {
    const set = new Set(sellers);
    if (set.has(name)) set.delete(name);
    else set.add(name);
    return hrefWith({ seller: set.size ? [...set].join(SELLER_SEPARATOR) : null });
  };
  // a picked seller stays listed even when it's past the first ten
  const sellerRows = [...sellerFacets.slice(0, 10), ...sellerFacets.slice(10).filter((s) => sellers.includes(s.name))];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="m-0 mb-1 text-[14px] font-semibold">Department</h3>
        <ul className="m-0 flex list-none flex-col p-0">
          <li>
            <a href={hrefWith({ dept: 'all', brand: null, w: null, preset: null })} aria-current={dept ? undefined : 'true'} className={cn(row, !dept && 'font-semibold')}>All departments</a>
          </li>
          {categories.map((c) => (
            <li key={c.slug}>
              <a href={hrefWith({ dept: c.slug, brand: null, w: null, preset: null, use: null })} aria-current={dept === c.slug ? 'true' : undefined} className={cn(row, dept === c.slug && 'font-semibold')}>
                {c.name}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {brandFacets.length ? (
        <div>
          <h3 className="m-0 mb-1 text-[14px] font-semibold">Brand</h3>
          <ul className="m-0 flex list-none flex-col p-0">
            {brandFacets.slice(0, 10).map((b) => {
              const on = brands.includes(b.name);
              return (
                <li key={b.name}>
                  <a href={toggleBrand(b.name)} role="checkbox" aria-checked={on} className={row}>
                    <Box on={on} />
                    <span className={on ? 'font-semibold' : undefined}>{b.name}</span>
                    <span className="ml-auto text-[12px] text-ink-3 tabular-nums">{b.count}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {sellerRows.length ? (
        <div>
          <h3 className="m-0 mb-1 text-[14px] font-semibold">Seller</h3>
          <ul className="m-0 flex list-none flex-col p-0">
            {sellerRows.map((s) => {
              const on = sellers.includes(s.name);
              return (
                <li key={s.name}>
                  <a href={toggleSeller(s.name)} role="checkbox" aria-checked={on} className={row}>
                    <Box on={on} />
                    <span className={on ? 'font-semibold' : undefined}>{s.name}</span>
                    <span className="ml-auto text-[12px] text-ink-3 tabular-nums">{s.count}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {pricePresets.length ? (
        <div>
          <h3 className="m-0 mb-1 text-[14px] font-semibold">Price</h3>
          <ul className="m-0 flex list-none flex-col p-0">
            {pricePresets.map((p) => {
              const on = p.min === minPrice && p.max === maxPrice;
              // `budget=0`: no ceiling, even one read from the words typed
              const href = on
                ? hrefWith({ min: null, budget: '0' })
                : hrefWith({ min: p.min ? String(p.min) : null, budget: p.max ? String(p.max) : '0' });
              return (
                <li key={p.label}>
                  <a href={href} role="checkbox" aria-checked={on} className={row}>
                    <Box on={on} />
                    <span className={on ? 'font-semibold' : undefined}>{p.label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="m-0 mb-1 text-[14px] font-semibold">Customer rating</h3>
        <ul className="m-0 flex list-none flex-col p-0">
          {[4, 3].map((n) => (
            <li key={n}>
              <a href={hrefWith({ rating: rating === n ? null : String(n) })} role="checkbox" aria-checked={rating === n} className={row}>
                <Box on={rating === n} />
                <Stars rating={n} size={14} />
                <span>&amp; up</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="m-0 mb-1 text-[14px] font-semibold">Deals</h3>
        <a href={hrefWith({ deal: deal ? null : '1' })} role="checkbox" aria-checked={deal} className={row}>
          <Box on={deal} />
          <span>On sale now</span>
        </a>
      </div>

      <div>
        <h3 className="m-0 mb-1 text-[14px] font-semibold">Discount</h3>
        <ul className="m-0 flex list-none flex-col p-0">
          {DISCOUNTS.map((n) => (
            <li key={n}>
              <a href={hrefWith({ pct: minDiscount === n ? null : String(n) })} role="checkbox" aria-checked={minDiscount === n} className={row}>
                <Box on={minDiscount === n} />
                <span className={minDiscount === n ? 'font-semibold' : undefined}>{n}% off or more</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="m-0 mb-1 text-[14px] font-semibold">Availability</h3>
        <a href={hrefWith({ oos: includeOutOfStock ? null : '1' })} role="checkbox" aria-checked={includeOutOfStock} className={row}>
          <Box on={includeOutOfStock} />
          <span>Include Out of Stock</span>
        </a>
      </div>
    </div>
  );
}
