import { useId, type SelectHTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import { selectClass } from '../lib/controls';

export interface SelectOption { value: string; label: string }
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
}

/** 31px select, surface gradient, rounded (design.md §5 Select). */
export function Select({ label, options, id, className, ...props }: SelectProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <div className="flex flex-col gap-1">
      {label ? <label htmlFor={fieldId} className="text-[13px] font-bold text-ink">{label}</label> : null}
      <select
        id={fieldId}
        className={cn(selectClass, className)}
        {...props}
      >
        {options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </div>
  );
}
