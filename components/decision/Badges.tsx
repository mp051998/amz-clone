import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/** "92% match" — mono 12/600 on surface-2, radius 6 (design.md §5 Match badge). */
export function MatchBadge({ match, className }: { match: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(match)));
  return (
    <span className={cn('inline-flex items-center rounded-chip bg-surface-2 px-2 py-1 font-mono text-[12px] font-semibold leading-none text-ink', className)} aria-label={`${pct}% match for your priorities`}>
      {pct}% match
    </span>
  );
}

/** Accent tag for the #1 ranked item ("Top pick for you", "Best match"). */
export function TopPickBadge({ children = 'Top pick for you', className }: { children?: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-chip bg-accent px-2 py-1 text-[12px] font-bold leading-none text-on-accent', className)}>{children}</span>;
}

/** Mono uppercase kicker ("YOU SEARCHED", "WHY IT'S HERE"). `onDark` uses accent-soft for dark panels. */
export function Kicker({ children, tone = 'default', as: Tag = 'span', className }: { children: ReactNode; tone?: 'default' | 'onDark'; as?: 'span' | 'p' | 'h2' | 'h3' | 'div'; className?: string }) {
  return (
    <Tag className={cn('m-0 font-mono text-[12px] font-medium uppercase leading-snug tracking-[0.04em]', tone === 'onDark' ? 'text-accent-soft' : 'text-ink-3', className)}>
      {children}
    </Tag>
  );
}

/**
 * Transparency label for generated or derived content (design.md §9): "AI SUMMARY · FROM 1,204 REVIEWS"
 * when source is 'ai', "BASED ON RATINGS & SPECS" (or `rulesLabel`) when rules produced it.
 */
export function SourceTag({ source, detail, rulesLabel = 'Based on ratings & specs', className }: { source: 'ai' | 'rules'; detail?: string; rulesLabel?: string; className?: string }) {
  const head = source === 'ai' ? 'AI summary' : rulesLabel;
  return (
    <Kicker className={cn('text-[11px]', className)}>
      {head}{detail ? ` · ${detail}` : ''}
    </Kicker>
  );
}

/** Dashed empty/zero state card ("Nothing fits under ₹8,000. Widen budget"). */
export function EmptyState({ title, children, action, className }: { title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-start gap-2 rounded-card border border-dashed border-line-3 bg-surface p-7 text-[15px] text-ink', className)}>
      {title ? <strong className="text-[16px] font-semibold">{title}</strong> : null}
      {children ? <div className="text-ink-2">{children}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
