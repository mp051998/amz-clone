import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

type Tone = 'deal' | 'pick' | 'bestseller' | 'choice';
const TONE: Record<Tone, string> = {
  deal: 'bg-badge-deal text-white',
  pick: 'bg-badge-pick text-white',
  bestseller: 'bg-badge-bestseller text-white',
  choice: 'bg-nav-main text-white',
};

/** Filled chip, 12px, radius 4 (design.md §5 Badges). */
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={cn('inline-block rounded-[4px] px-1.5 py-0.5 text-[12px] font-normal leading-tight', TONE[tone])}>{children}</span>;
}
