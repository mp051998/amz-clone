import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface StepCardProps {
  n: number;
  title: string;
  value: ReactNode;
  sub?: ReactNode;
  /** "Change" / "Done" toggle; omitted for steps with nothing to choose. */
  toggle?: { open: boolean; onToggle: () => void; controls: string; label?: string };
  children?: ReactNode;
  className?: string;
}

/** Numbered checkout step: ink number disc, mono-free title/value/sub, Change pill (prototype Checkout). */
export function StepCard({ n, title, value, sub, toggle, children, className }: StepCardProps) {
  return (
    <section className={cn('flex flex-col gap-3 rounded-card border border-line bg-surface p-[18px]', className)} aria-label={`${n}. ${title}`}>
      <div className="flex items-start gap-3.5">
        <span aria-hidden className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-on-ink">{n}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[13px] text-ink-3">{title}</span>
          <strong className="text-[17px] font-semibold">{value}</strong>
          {sub ? <span className="text-[14px] text-ink-2">{sub}</span> : null}
        </div>
        {toggle ? (
          <button
            type="button"
            onClick={toggle.onToggle}
            aria-expanded={toggle.open}
            aria-controls={toggle.controls}
            aria-label={`${toggle.open ? 'Done choosing' : 'Change'} ${toggle.label ?? title.toLowerCase()}`}
            className="min-h-11 flex-none rounded-pill border border-line-3 bg-surface px-3.5 text-[14px] text-ink transition-colors hover:border-ink"
          >
            {toggle.open ? 'Done' : 'Change'}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Radio card used in step option lists: 1.5px border (ink when chosen), round 18px radio mark. */
export function OptionCard({ id, name, value, checked, onChange, label, sub, badge, disabled = false }: {
  id?: string;
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
  sub?: ReactNode;
  badge?: string;
  /** shown greyed out and can't be chosen (`sub` says why) */
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex min-h-[52px] items-center gap-3 rounded-input border-[1.5px] bg-surface p-3 text-left transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink',
        disabled ? 'cursor-not-allowed border-line opacity-60' : checked ? 'cursor-pointer border-ink' : 'cursor-pointer border-line hover:border-line-3',
      )}
    >
      <input id={id} type="radio" name={name} value={value} checked={checked} onChange={onChange} disabled={disabled} className="sr-only" />
      <span aria-hidden className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border-[1.5px] border-ink">
        <span className={cn('h-2.5 w-2.5 rounded-full', checked ? 'bg-ink' : 'bg-transparent')} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{label}</span>
        {sub ? <span className="text-[13px] text-ink-2">{sub}</span> : null}
      </span>
      {badge ? <span className="flex-none rounded-chip bg-surface-2 px-2 py-1 text-[12px] font-semibold text-ink-2">{badge}</span> : null}
    </label>
  );
}
