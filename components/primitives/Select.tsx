import { useId, type SelectHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

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
        className={cn('h-[31px] rounded-[8px] border border-line-2 bg-surface-2 px-2 text-[13px] text-ink outline-none focus:border-[#E77600]', className)}
        {...props}
      >
        {options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </div>
  );
}
