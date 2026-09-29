import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import { fieldClass } from '../lib/controls';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

/** 44px field, radius 10, line-3 border, ink focus (design.md §5 Inputs). Label above, error below. */
export function Input({ label, error, hint, id, className, ...props }: InputProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const errId = `${fieldId}-err`;
  const hintId = `${fieldId}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      {label ? <label htmlFor={fieldId} className="text-[14px] font-semibold text-ink">{label}</label> : null}
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(fieldClass, error && 'border-bad', className)}
        {...props}
      />
      {hint && !error ? <span id={hintId} className="text-[13px] text-ink-3">{hint}</span> : null}
      {error ? (
        <span id={errId} className="flex items-center gap-1.5 text-[13px] text-bad">
          <span aria-hidden className="font-bold">⚠</span>
          <span>{error}</span>
        </span>
      ) : null}
    </div>
  );
}
