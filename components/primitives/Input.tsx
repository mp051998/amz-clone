import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

/** 31px field, 1px border, inset shadow, focus orange (design.md §5 Inputs). Label above, error below. */
export function Input({ label, error, id, className, ...props }: InputProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const errId = `${fieldId}-err`;
  return (
    <div className="flex flex-col gap-1">
      {label ? <label htmlFor={fieldId} className="text-[13px] font-bold text-ink">{label}</label> : null}
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        className={cn(
          'h-[31px] rounded-[3px] border bg-white px-2 text-[13px] text-ink shadow-input outline-none',
          'focus:border-[#E77600] focus:ring-[3px] focus:ring-[rgb(228_121_17_/_0.5)]',
          error ? 'border-error' : 'border-[#A6A6A6]',
          className,
        )}
        {...props}
      />
      {error ? (
        <span id={errId} className="flex items-center gap-1 text-[12px] text-error">
          <span aria-hidden>⚠</span>
          <span>{error}</span>
        </span>
      ) : null}
    </div>
  );
}
