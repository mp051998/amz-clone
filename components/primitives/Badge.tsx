import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * New tones: `accent` (Top pick, deal %), `neutral` (surface-2 tag), `dark` (ink, e.g. PLUS),
 * `good`, `warn`.
 */
export type BadgeTone = 'accent' | 'neutral' | 'dark' | 'good' | 'warn';
const TONE: Record<BadgeTone, string> = {
  accent: 'bg-accent text-on-accent',
  neutral: 'bg-surface-2 text-ink-2',
  dark: 'bg-ink text-on-ink',
  good: 'bg-good-bg text-good-strong',
  warn: 'bg-warn-bg text-warn-strong',
};

/** Small filled tag, 12px/700, radius 6 (design.md §5 Badges). */
export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-chip px-2 py-1 text-[12px] font-bold leading-none', TONE[tone], className)}>{children}</span>;
}

/** Alias: a chip is a Badge in the neutral tone. */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <Badge tone="neutral" className={cn('font-medium text-[13px]', className)}>{children}</Badge>;
}
