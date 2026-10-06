import type { ProductVariant } from '@/lib/data/catalog';
import { VISUAL_AXES } from '@/lib/variants';
import { ProductFrame } from '../decision/ProductFrame';
import { cn } from '../lib/cn';

export interface VariantPickerProps {
  axis: string;
  /** the current product's option. */
  label: string;
  options: (ProductVariant & { href: string; priceText: string })[];
}

/**
 * "Color: Black" above the group's options (PDP). Each option is its own product page; the
 * current one is marked, sold-out ones stay reachable but dimmed.
 */
export function VariantPicker({ axis, label, options }: VariantPickerProps) {
  const visual = VISUAL_AXES.test(axis);
  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="m-0 text-[15px] font-normal text-ink-2">
        {axis}: <strong className="font-semibold text-ink">{label}</strong>
      </h2>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={`${axis} options`}>
        {options.map((o) => {
          const out = o.stock <= 0;
          return (
            <li key={o.id}>
              <a
                href={o.href}
                aria-current={o.current ? 'page' : undefined}
                aria-label={`${axis}: ${o.label}, ${out ? 'out of stock' : o.priceText}`}
                className={cn(
                  'flex flex-col gap-1 rounded-card border bg-surface text-ink no-underline',
                  visual ? 'w-[92px] p-1.5' : 'min-w-[112px] max-w-[220px] px-3 py-2',
                  o.current ? 'border-2 border-ink' : 'border-line-3 hover:border-ink-3',
                  out && !o.current && 'opacity-60',
                )}
              >
                {visual ? <ProductFrame src={o.image} aspect="1/1" inset="10%" label={o.label} /> : null}
                <span className={cn('text-[13px] leading-tight', visual ? 'truncate' : 'font-semibold')}>{o.label}</span>
                <span className={cn('text-[12px] tabular-nums', out ? 'text-bad' : 'text-ink-2')}>{out ? 'Out of stock' : o.priceText}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
