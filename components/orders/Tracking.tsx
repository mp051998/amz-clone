import type { ReactNode } from 'react';
import { Kicker } from '../decision/Badges';
import { cn } from '../lib/cn';
import type { TrackingStep } from '@/lib/decision/types';
import { lcFirst, stepTime, type ChipTone, type StoreDates } from './format';

/** Ink ETA panel: mono kicker (accent-soft) + big headline + window (design.md §5 Timeline). */
export function EtaPanel({ kicker, headline, window: line }: { kicker: string; headline: string; window?: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-tray bg-ink p-6 text-on-ink">
      <Kicker tone="onDark" className="text-[14px]">{kicker}</Kicker>
      <strong className="text-[clamp(30px,5vw,42px)] font-semibold leading-[1.05] tracking-[-0.02em]">{headline}</strong>
      {line ? <span className="text-[18px]">{line}</span> : null}
    </div>
  );
}

/**
 * Vertical delivery timeline: done = good-dot filled ✓, current = accent fill with an ink ring,
 * upcoming = hollow line-3 ring; connectors good-dot up to the current step, line-2 after.
 */
export function Timeline({ steps, store, now = new Date() }: { steps: TrackingStep[]; store: StoreDates; now?: Date }) {
  return (
    <ol className="m-0 flex list-none flex-col p-0" aria-label="Delivery progress">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const next = steps[i + 1];
        const at = new Date(s.at);
        const reached = s.state !== 'upcoming';
        return (
          <li key={s.label} className="flex gap-3.5" aria-current={s.state === 'current' ? 'step' : undefined}>
            <div className="flex w-[26px] flex-none flex-col items-center">
              <span
                aria-hidden
                className={cn(
                  'flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 text-[13px] font-bold text-white',
                  s.state === 'done' && 'border-good-dot bg-good-dot',
                  s.state === 'current' && 'border-ink bg-accent',
                  s.state === 'upcoming' && 'border-line-3 bg-surface',
                )}
              >
                {s.state === 'done' ? '✓' : ''}
              </span>
              {last ? null : (
                <span aria-hidden className={cn('min-h-[22px] w-0.5 flex-1', next && next.state !== 'upcoming' ? 'bg-good-dot' : 'bg-line-2')} />
              )}
            </div>
            <div className={cn('flex flex-col gap-0.5', last ? 'pb-0' : 'pb-[18px]')}>
              <span className={cn('text-[16px]', s.state === 'current' ? 'font-bold text-ink' : reached ? 'font-medium text-ink' : 'font-medium text-ink-3')}>
                <span className="sr-only">{s.state === 'done' ? 'Done: ' : s.state === 'current' ? 'Current: ' : 'Upcoming: '}</span>
                {s.label}
              </span>
              <span className="font-mono text-[13px] text-ink-3">{reached ? stepTime(at, store, now) : `Expected ${lcFirst(stepTime(at, store, now))}`}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const CHIP: Record<ChipTone, string> = {
  good: 'bg-good-bg text-good-strong',
  neutral: 'bg-surface-2 text-ink-2',
  warn: 'bg-warn-bg text-warn-strong',
  dark: 'bg-ink text-on-ink',
};

/** Order status chip ("Arriving tomorrow", "Delivered", "Payment pending"). */
export function StatusChip({ label, tone }: { label: string; tone: ChipTone }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-chip px-2 py-1 text-[13px] font-semibold', CHIP[tone])}>
      {tone === 'good' ? <span aria-hidden className="h-2 w-2 rounded-full bg-good-dot" /> : null}
      {label}
    </span>
  );
}

/** White card of key/value rows (order facts). */
export function FactsCard({ rows, className }: { rows: { label: string; value: ReactNode; strong?: boolean }[]; className?: string }) {
  return (
    <dl className={cn('m-0 flex flex-col gap-2 rounded-panel border border-line bg-surface p-[18px] text-[15px]', className)}>
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-3">
          <dt className="flex-none text-ink-2">{r.label}</dt>
          <dd className={cn('m-0 min-w-0 text-right', r.strong && 'font-bold')}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
