import { cn } from '../lib/cn';

export interface PriorityDotsProps {
  /** 0..max (0 = doesn't matter). */
  value: number;
  max?: number;
  /** attribute label, used in aria text ("Battery life"). */
  label: string;
  /** makes the dots buttons (client parent required). Clicking the current value clears to 0. */
  onChange?: (value: number) => void;
  /** 'md' = 16px dots in 32×36 hit areas (priorities panel); 'sm' = 14px static (quiz result). */
  size?: 'sm' | 'md';
  className?: string;
}

export const LEVEL_TEXT = ["Doesn't matter", 'A little', 'Somewhat', 'Important', 'Very important', 'Must have'];

/** 0..5 importance dots, filled ink (design.md §5 Priorities panel). Static unless `onChange` is given. */
export function PriorityDots({ value, max = 5, label, onChange, size = 'md', className }: PriorityDotsProps) {
  const v = Math.max(0, Math.min(max, Math.round(value)));
  const dot = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  const dots = Array.from({ length: max }, (_, i) => i + 1);

  if (!onChange) {
    return (
      <span role="img" aria-label={`${label}: ${v} of ${max}`} className={cn('inline-flex flex-none gap-[5px]', className)}>
        {dots.map((n) => (
          <span key={n} aria-hidden className={cn('block rounded-full border-[1.5px] border-ink', dot, n <= v ? 'bg-ink' : 'bg-surface')} />
        ))}
      </span>
    );
  }

  return (
    <span role="group" aria-label={`${label} importance`} className={cn('inline-flex flex-none', className)}>
      {dots.map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`Set ${label} to ${n} of ${max}`}
          aria-pressed={n <= v}
          onClick={() => onChange(n === v ? 0 : n)}
          className="flex h-9 w-8 items-center justify-center rounded-chip"
        >
          <span aria-hidden className={cn('block rounded-full border-[1.5px] border-ink transition-colors', dot, n <= v ? 'bg-ink' : 'bg-surface')} />
        </button>
      ))}
    </span>
  );
}
