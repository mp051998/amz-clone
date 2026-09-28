import type { ReactNode } from 'react';
import { PriorityDots } from '../decision/PriorityDots';

/** `k` omitted → the value spans the row (feature bullets). */
export interface SpecRow { k?: string; v: ReactNode }
export interface SpecGroup { name: string; rows: SpecRow[]; open?: boolean }

/** Attribute scores (1..5) rendered as static dots for the "Scores" group. */
export function scoreRows(scores: { label: string; score: number }[]): SpecRow[] {
  return scores.map((s) => ({
    k: s.label,
    v: (
      <span className="inline-flex items-center gap-2.5">
        <PriorityDots value={s.score} label={s.label} size="sm" />
        <span className="font-mono text-[12px] text-ink-3 tabular-nums">{s.score}/5</span>
      </span>
    ),
  }));
}

/**
 * Specifications accordion (prototype Product detail). Native <details>, so it works without JS
 * and keeps the disclosure semantics; the first group starts open.
 */
export function Specs({ groups }: { groups: SpecGroup[] }) {
  const shown = groups.filter((g) => g.rows.length);
  if (!shown.length) return null;
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      {shown.map((g, i) => (
        <details key={g.name} open={g.open ?? i === 0} className="group border-t border-line-2 first:border-t-0">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-[18px] py-[15px] text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
            <span>{g.name}</span>
            <span aria-hidden className="text-[14px] text-ink-3 transition-transform group-open:rotate-180">▾</span>
          </summary>
          <dl className="m-0 flex flex-col px-[18px] pb-3.5">
            {g.rows.map((r, j) => (
              <div key={`${r.k ?? 'row'}-${j}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 border-t border-dashed border-line-2 py-2 text-[15px]">
                {r.k ? <dt className="text-ink-2">{r.k}</dt> : null}
                <dd className={r.k ? 'm-0 min-w-0 break-words' : 'col-span-2 m-0 min-w-0 break-words'}>{r.v}</dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
    </div>
  );
}
