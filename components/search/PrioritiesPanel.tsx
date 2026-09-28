'use client';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { writeDecisionParams } from '@/lib/decision/params';
import type { CurrencyCode } from '@/lib/contracts';
import { formatMoney } from '@/lib/marketplaces';
import type { Weights } from '@/lib/decision/types';
import { cn } from '../lib/cn';
import { storeHref, type MarketId } from '../lib/store';
import { PriorityDots, LEVEL_TEXT } from '../decision/PriorityDots';

export interface PrioritiesPanelProps {
  market: MarketId;
  /** category the weights belong to (null = generic). */
  category: string | null;
  attributes: { key: string; label: string }[];
  weights: Weights;
  /** "Travel", "Custom", "Tuned for you" — shown on the mobile toggle. */
  presetLabel: string;
  currency: CurrencyCode;
  budget: { valueMinor: number | null; minMinor: number; maxMinor: number; stepMinor: number };
  /** current /s query (no "?"), with the effective `use` materialised so implied weights match the server. */
  baseQuery: string;
  resetHref: string;
  /** "TUNED FROM YOUR ANSWERS" box or the dashed quiz prompt (server-rendered). */
  profileSlot: ReactNode;
  /** brand / rating / deal facets for "More filters" (server-rendered links). */
  filtersSlot: ReactNode;
  /** number of active facet filters (opens "More filters" when > 0). */
  activeFilters: number;
}

const SLIDER_DEBOUNCE_MS = 350;

/**
 * Sticky priorities aside (design.md §5 Priorities panel): budget slider, 0–5 dots per attribute,
 * Reset, profile box and More filters. Every change router.replace()s the URL (params.ts) so the
 * server re-ranks; the slider is debounced. Collapses behind a toggle below md.
 */
export function PrioritiesPanel(props: PrioritiesPanelProps) {
  const { market, category, attributes, currency, budget, baseQuery, resetHref, presetLabel } = props;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [weights, setWeights] = useState<Weights>(props.weights);
  const [budgetValue, setBudgetValue] = useState<number>(budget.valueMinor ?? budget.maxMinor);
  const [filtersOpen, setFiltersOpen] = useState(props.activeFilters > 0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filtersRef = useRef<HTMLDetailsElement>(null);

  // follow the server when the URL changes underneath us (presets, back/forward)
  const weightsKey = JSON.stringify(props.weights);
  useEffect(() => setWeights(JSON.parse(weightsKey) as Weights), [weightsKey]);
  useEffect(() => setBudgetValue(budget.valueMinor ?? budget.maxMinor), [budget.valueMinor, budget.maxMinor]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const go = (qs: URLSearchParams) => {
    const s = qs.toString().replace(/%2C/gi, ',');
    start(() => router.replace(storeHref(market, s ? `/s?${s}` : '/s'), { scroll: false }));
  };

  const setWeight = (key: string, value: number) => {
    const next = { ...weights, [key]: value };
    setWeights(next);
    // hand-tuned → no longer a named preset / quiz profile
    go(writeDecisionParams({ weights: next, preset: null }, category, new URLSearchParams(baseQuery)));
  };

  const onBudget = (value: number) => {
    setBudgetValue(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      go(writeDecisionParams({ budgetMinor: value }, category, new URLSearchParams(baseQuery)));
    }, SLIDER_DEBOUNCE_MS);
  };

  const budgetText = budget.valueMinor == null && budgetValue >= budget.maxMinor ? 'Any price' : `${formatMoney(0, currency)} — ${formatMoney(budgetValue, currency)}`;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="priorities-panel"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between rounded-input border border-ink bg-surface px-3.5 py-3 text-[15px] font-semibold md:hidden"
      >
        <span>Your priorities · {presetLabel}</span>
        <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      <div
        id="priorities-panel"
        className={cn('flex-col gap-[18px] rounded-card border border-line bg-surface p-[18px] md:flex', open ? 'flex' : 'hidden')}
        aria-busy={pending || undefined}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="m-0 text-[18px] font-semibold">Your priorities</h2>
          <a href={resetHref} className="text-[13px] text-ink-2 underline underline-offset-2">Reset</a>
        </div>

        {props.profileSlot}

        <div className="flex flex-col gap-2">
          <div className="flex justify-between gap-2 text-[14px]">
            <label htmlFor="budget-range" className="font-semibold">Price</label>
            <span className="tabular-nums" aria-live="polite">{budgetText}</span>
          </div>
          <input
            id="budget-range"
            type="range"
            min={budget.minMinor}
            max={budget.maxMinor}
            step={budget.stepMinor}
            value={Math.min(budget.maxMinor, Math.max(budget.minMinor, budgetValue))}
            onChange={(e) => onBudget(Number(e.target.value))}
            aria-valuetext={budgetText}
            className="h-6 w-full accent-ink"
          />
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="mb-1 text-[14px] font-semibold">What matters most?</span>
          {attributes.map((a) => (
            <div key={a.key} className="flex items-center justify-between gap-2">
              <div className="flex flex-col leading-tight">
                <span className="text-[15px]">{a.label}</span>
                <span className="text-[12px] text-ink-3">{LEVEL_TEXT[weights[a.key] ?? 0]}</span>
              </div>
              <PriorityDots value={weights[a.key] ?? 0} label={a.label} onChange={(v) => setWeight(a.key, v)} />
            </div>
          ))}
        </div>

        <p className="m-0 text-[13px] leading-snug text-ink-3">
          {pending ? 'Re-ranking…' : 'Results re-rank as you adjust.'} Brand, rating and deal filters live under{' '}
          <button
            type="button"
            className="text-[13px] text-ink underline underline-offset-2"
            onClick={() => {
              setFiltersOpen(true);
              requestAnimationFrame(() => filtersRef.current?.querySelector('summary')?.focus());
            }}
          >
            More filters
          </button>
          .
        </p>

        <details
          ref={filtersRef}
          open={filtersOpen}
          onToggle={(e) => setFiltersOpen((e.currentTarget as HTMLDetailsElement).open)}
          className="border-t border-line-2 pt-3"
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
            <span>More filters{props.activeFilters ? ` · ${props.activeFilters}` : ''}</span>
            <span aria-hidden>{filtersOpen ? '−' : '+'}</span>
          </summary>
          <div className="pt-2">{props.filtersSlot}</div>
        </details>
      </div>
    </div>
  );
}
