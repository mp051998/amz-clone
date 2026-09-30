import { storePath } from '@/lib/marketplace';
import { optionCount, VISUAL_AXES, type VariantSummary } from '@/lib/variants';
import { ProductFrame } from '../decision/ProductFrame';
import { cn } from '../lib/cn';
import type { Store } from '../lib/store';

const SHOWN = 4;

/**
 * A listing card's hint that the product comes in more than one option: small image swatches
 * linking to each (colours, patterns) and the count, or just the count ("3 sizes").
 */
export function VariantSwatches({ variants, currentId, store }: { variants: VariantSummary; currentId: string; store: Store }) {
  const n = variants.options.length;
  if (n < 2) return null;
  const count = optionCount(variants.axis, n);
  if (!VISUAL_AXES.test(variants.axis)) return <span className="text-[13px] text-ink-2">{count}</span>;
  // the card's own option first, so it's always among the shown ones
  const shown = [...variants.options].sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId)).slice(0, SHOWN);
  return (
    <div className="flex items-center gap-2">
      <ul className="m-0 flex list-none gap-1 p-0" aria-label={`${variants.axis} options`}>
        {shown.map((o) => {
          const current = o.id === currentId;
          return (
            <li key={o.id}>
              <a
                href={storePath(store, `/product/${o.id}`)}
                title={o.label}
                aria-label={`${variants.axis}: ${o.label}${o.stock <= 0 ? ', out of stock' : ''}`}
                aria-current={current ? 'true' : undefined}
                className={cn(
                  'block w-8 overflow-hidden rounded-[6px] bg-surface',
                  current ? 'border-2 border-ink' : 'border border-line-3 hover:border-ink-3',
                  o.stock <= 0 && !current && 'opacity-50',
                )}
              >
                <ProductFrame src={o.image} aspect="1/1" inset="6%" label="" />
              </a>
            </li>
          );
        })}
      </ul>
      <span className="text-[13px] text-ink-2">{count}</span>
    </div>
  );
}
