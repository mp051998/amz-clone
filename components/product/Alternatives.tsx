'use client';
import { useEffect, useState } from 'react';
import { ProductFrame } from '../decision/ProductFrame';
import { MatchBadge } from '../decision/Badges';
import { useCompare, type CompareItem } from '../decision/Compare';
import { useToast } from '../decision/Toast';
import { buttonClasses } from '../primitives/Button';

export interface AlternativeCard {
  id: string;
  name: string;
  image?: string;
  href: string;
  priceText: string;
  rating: number;
  /** "₹800 cheaper · better battery life" */
  diff: string;
  match?: number;
}

/**
 * "Often compared with" (prototype Product detail): small cards with the one-line difference and a
 * Compare button that puts this product and the alternative in the compare tray (its "Compare N →").
 */
export function Alternatives({ base, items }: { base: CompareItem; items: AlternativeCard[] }) {
  const compare = useCompare();
  const { items: tray, max, toggle } = compare;
  const { toast } = useToast();
  // toggle() closes over the current list, so add one item per render
  const [queue, setQueue] = useState<CompareItem[]>([]);
  useEffect(() => {
    if (!queue.length) return;
    const [next, ...rest] = queue;
    if (!tray.some((t) => t.id === next.id)) toggle(next);
    setQueue(rest);
  }, [queue, tray, toggle]);

  const onCompare = (alt: AlternativeCard) => {
    const want = [base, { id: alt.id, name: alt.name, image: alt.image }];
    const missing = want.filter((w) => !tray.some((t) => t.id === w.id));
    if (!missing.length) { toast('Both are already in your compare tray'); return; }
    if (tray.length + missing.length > max) {
      toast(`You can compare up to ${max} products — remove one from the tray first`);
      return;
    }
    setQueue(missing);
    toast(`Added to compare · ${tray.length + missing.length} in the tray`);
  };

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-3.5">
      {items.map((a) => (
        <div key={a.id} className="flex items-start gap-3.5 rounded-card border border-line bg-surface p-3.5">
          <a href={a.href} className="block w-[84px] flex-none" aria-label={a.name} tabIndex={-1}>
            <ProductFrame src={a.image} alt="" aspect="1/1" inset="10%" />
          </a>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <a href={a.href} className="line-clamp-2 text-[16px] font-semibold leading-tight text-ink no-underline hover:text-accent-ink">{a.name}</a>
            <span className="text-[14px] tabular-nums">
              {a.priceText} · <span aria-hidden className="text-star">★</span> {a.rating.toFixed(1)}
            </span>
            <span className="text-[13px] text-ink-2">{a.diff}</span>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => onCompare(a)} className={buttonClasses({ variant: 'secondary', size: 'md' })}>
                Compare
              </button>
              {a.match != null ? <MatchBadge match={a.match} /> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
