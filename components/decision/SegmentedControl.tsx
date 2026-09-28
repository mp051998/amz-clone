import { cn } from '../lib/cn';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  /** render as a link (server-friendly URL state, e.g. ?sort=price). */
  href?: string;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  /** client callback; omit when every option has an href. */
  onChange?: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/** Pill track on surface-4 with a white selected segment ("Best match · Price · Rating"). */
export function SegmentedControl<T extends string>({ options, value, onChange, ariaLabel, className }: SegmentedControlProps<T>) {
  const seg = (on: boolean) =>
    cn('inline-flex min-h-8 items-center rounded-pill px-3 text-[13px] font-medium text-ink no-underline transition-colors', on ? 'bg-surface shadow-[0_1px_2px_rgb(20_20_20/0.08)]' : 'hover:bg-surface-2');
  return (
    <div role="group" aria-label={ariaLabel} className={cn('inline-flex gap-1 rounded-pill bg-surface-4 p-[3px]', className)}>
      {options.map((o) =>
        o.href ? (
          <a key={o.value} href={o.href} aria-current={o.value === value ? 'true' : undefined} className={cn(seg(o.value === value), 'hover:text-ink')}>{o.label}</a>
        ) : (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange?.(o.value)} className={seg(o.value === value)}>{o.label}</button>
        ),
      )}
    </div>
  );
}
