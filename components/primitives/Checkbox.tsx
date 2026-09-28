import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

/** 18px native checkbox, ink accent, label is the 44px-tall hit area (design.md §5 Inputs). */
export function Checkbox({ label, id, className, ...props }: CheckboxProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <label htmlFor={fieldId} className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] text-ink">
      <input id={fieldId} type="checkbox" className={cn('h-[18px] w-[18px] shrink-0 cursor-pointer accent-ink', className)} {...props} />
      {label}
    </label>
  );
}
