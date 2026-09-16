import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

/** 13px square, checked accent link-teal (design.md §5 Inputs). */
export function Checkbox({ label, id, className, ...props }: CheckboxProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <label htmlFor={fieldId} className="inline-flex items-center gap-2 text-[14px] text-ink">
      <input id={fieldId} type="checkbox" className={cn('h-[13px] w-[13px] rounded-[3px] accent-[#007185]', className)} {...props} />
      {label}
    </label>
  );
}
