import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

type Tone = 'info' | 'warning' | 'error' | 'success';
const TONE: Record<Tone, string> = {
  info: 'border-link-teal bg-surface-3',
  warning: 'border-warn bg-[#FEF8F2]',
  error: 'border-error bg-[#FFF5F5]',
  success: 'border-success bg-[#F0FBF5]',
};

/** Boxed callout, 1px border, radius 8 (design.md §5 Alerts). */
export function Alert({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <div role="alert" className={cn('rounded-[8px] border p-3 text-[14px] text-ink', TONE[tone])}>{children}</div>;
}
