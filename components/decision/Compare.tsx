'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { storeHref, type MarketId } from '../lib/store';
import { cn } from '../lib/cn';
import { useToast } from './Toast';

/** What the tray needs to show an item without refetching. */
export interface CompareItem {
  id: string;
  name: string;
  image?: string;
}

export interface CompareApi {
  items: CompareItem[];
  max: number;
  market: MarketId;
  has: (id: string) => boolean;
  /** Add or remove; toasts "You can compare up to 4 products" on overflow. Returns the new state. */
  toggle: (item: CompareItem) => boolean;
  remove: (id: string) => void;
  clear: () => void;
  /** Store-aware /compare?ids=… for the current items. */
  href: string;
}

export const COMPARE_MAX = 4;
export const compareStorageKey = (market: MarketId) => `compare:v1:${market}`;

const CompareContext = createContext<CompareApi | null>(null);

const fallback: CompareApi = {
  items: [], max: COMPARE_MAX, market: 'US', has: () => false, toggle: () => false, remove: () => {}, clear: () => {}, href: '/compare',
};

/** Compare state; a no-op outside CompareProvider so isolated renders never crash. */
export function useCompare(): CompareApi {
  return useContext(CompareContext) ?? fallback;
}

function read(market: MarketId): CompareItem[] {
  try {
    const raw = window.localStorage.getItem(compareStorageKey(market));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is CompareItem => !!x && typeof x.id === 'string' && typeof x.name === 'string')
      .slice(0, COMPARE_MAX);
  } catch {
    return [];
  }
}

/**
 * Up-to-4 compare list per market, persisted in localStorage (`compare:v1:US|IN`) and synced across
 * tabs. Hydrates after mount so server HTML never depends on browser storage.
 */
export function CompareProvider({ market, children }: { market: MarketId; children: ReactNode }) {
  const { toast } = useToast();
  const [items, setItems] = useState<CompareItem[]>([]);

  useEffect(() => {
    setItems(read(market));
    const onStorage = (e: StorageEvent) => { if (e.key === compareStorageKey(market)) setItems(read(market)); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [market]);

  const commit = useCallback((next: CompareItem[]) => {
    setItems(next);
    try { window.localStorage.setItem(compareStorageKey(market), JSON.stringify(next)); } catch { /* private mode: keep in memory */ }
  }, [market]);

  const has = useCallback((id: string) => items.some((i) => i.id === id), [items]);
  const toggle = useCallback((item: CompareItem) => {
    if (items.some((i) => i.id === item.id)) { commit(items.filter((i) => i.id !== item.id)); return false; }
    if (items.length >= COMPARE_MAX) { toast(`You can compare up to ${COMPARE_MAX} products`); return false; }
    commit([...items, item]);
    return true;
  }, [items, commit, toast]);
  const remove = useCallback((id: string) => commit(items.filter((i) => i.id !== id)), [items, commit]);
  const clear = useCallback(() => commit([]), [commit]);

  const href = storeHref(market, `/compare?ids=${items.map((i) => encodeURIComponent(i.id)).join(',')}`);
  const api = useMemo<CompareApi>(() => ({ items, max: COMPARE_MAX, market, has, toggle, remove, clear, href }), [items, market, has, toggle, remove, clear, href]);
  return <CompareContext.Provider value={api}>{children}</CompareContext.Provider>;
}

/** Checkbox-pill that adds/removes a product from compare ("Compare" / "Comparing"). */
export function CompareToggle({ item, className }: { item: CompareItem; className?: string }) {
  const { has, toggle } = useCompare();
  const on = has(item.id);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={`Compare ${item.name}`}
      onClick={() => toggle(item)}
      className={cn(
        'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-pill border border-line-3 bg-surface px-3 text-[14px] font-medium text-ink transition-colors hover:border-ink',
        className,
      )}
    >
      <span aria-hidden className={cn('inline-flex h-[18px] w-[18px] items-center justify-center rounded-tag border-[1.5px] border-ink text-[12px] text-white', on ? 'bg-ink' : 'bg-surface')}>
        {on ? '✓' : ''}
      </span>
      {on ? 'Comparing' : 'Compare'}
    </button>
  );
}

/** Fixed bottom compare tray (design.md §5 Compare tray). Renders nothing when empty. */
export function CompareTray() {
  const { items, remove, clear, href } = useCompare();
  const { toast, setLifted } = useToast();
  const visible = items.length > 0;
  useEffect(() => { setLifted(visible); return () => setLifted(false); }, [visible, setLifted]);
  if (!visible) return null;

  const ready = items.length >= 2;
  const label = items.length === 1 ? 'Compare 1 product' : `Compare ${items.length} products`;
  return (
    <>
      {/* in-flow spacer so the fixed tray never covers the end of the page */}
      <div aria-hidden className="h-[150px] md:h-[96px]" />
      <section
        aria-label="Compare tray"
        className="fixed bottom-4 left-1/2 z-[60] flex w-[min(960px,calc(100%-24px))] -translate-x-1/2 flex-wrap items-center gap-3 rounded-tray border-[1.5px] border-ink bg-surface px-3.5 py-3 shadow-tray"
      >
        <strong className="flex-none text-[15px]">{label}</strong>
        <ul className="no-scrollbar flex min-w-0 flex-[1_1_200px] gap-2 overflow-x-auto">
          {items.map((i) => (
            <li key={i.id} className="flex flex-none items-center gap-2 rounded-input bg-surface-2 py-1.5 pl-2 pr-1.5 text-[13px] font-medium">
              <span aria-hidden className="hatch relative h-[26px] w-[26px] flex-none overflow-hidden rounded-[5px]">
                {i.image ? <img src={i.image} alt="" className="absolute inset-0 h-full w-full object-contain" /> : null}
              </span>
              <span className="max-w-[180px] truncate">{i.name}</span>
              <button type="button" onClick={() => remove(i.id)} aria-label={`Remove ${i.name} from compare`} className="flex h-6 w-6 items-center justify-center rounded-full text-[14px] hover:bg-surface-4">×</button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={clear} className="flex-none text-[13px] underline underline-offset-2">Clear</button>
        {ready ? (
          <a href={href} className="inline-flex min-h-11 flex-none items-center justify-center rounded-pill bg-accent px-[18px] max-md:flex-1 text-[15px] font-semibold text-ink no-underline hover:bg-accent-hover hover:text-ink">
            Compare {items.length} →
          </a>
        ) : (
          <button type="button" aria-disabled="true" onClick={() => toast('Add one more product to compare')} className="inline-flex min-h-11 flex-none items-center justify-center rounded-pill bg-surface-4 px-[18px] max-md:flex-1 text-[15px] font-semibold text-ink-3">
            Add 1 more
          </button>
        )}
      </section>
    </>
  );
}
