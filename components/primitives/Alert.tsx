import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

type Tone = 'info' | 'warning' | 'error' | 'success';
const TONE: Record<Tone, { box: string; mark: string; icon: string }> = {
  info: { box: 'bg-surface border-line', mark: 'text-ink-3', icon: 'ⓘ' },
  warning: { box: 'bg-warn-bg border-transparent', mark: 'text-warn', icon: '⚠' },
  error: { box: 'bg-bad-bg border-transparent', mark: 'text-bad', icon: '⚠' },
  success: { box: 'bg-good-bg border-transparent', mark: 'text-good-strong', icon: '✓' },
};

/** Calm callout: soft tone fill, radius 10, leading mark (design.md §5 Alerts). */
export function Alert({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  const t = TONE[tone];
  return (
    <div role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'} className={cn('flex gap-2.5 rounded-input border px-3.5 py-3 text-[14px] leading-[1.45] text-ink', t.box, className)}>
      <span aria-hidden className={cn('font-bold', t.mark)}>{t.icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
