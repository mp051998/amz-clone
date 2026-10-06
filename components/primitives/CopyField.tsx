'use client';
import { useId, useRef, useState } from 'react';
import { useToast } from '../decision/Toast';
import { fieldClass } from '../lib/controls';
import { cn } from '../lib/cn';

export interface CopyFieldProps {
  value: string;
  /** the field's accessible name, e.g. "Gift card code" */
  label: string;
  /** toast after copying, e.g. "Code copied" */
  copied: string;
  mono?: boolean;
}

/** A read-only value with a Copy button (selects the text when there's no clipboard). */
export function CopyField({ value, label, copied: copiedText, mono = false }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const id = useId();
  const { toast } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast(copiedText);
    } catch {
      field.current?.select();
    }
  };

  return (
    <div className="flex gap-2">
      <label className="sr-only" htmlFor={id}>{label}</label>
      <input
        ref={field}
        id={id}
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className={cn(fieldClass, 'min-w-0 flex-1', mono && 'font-mono tracking-[0.04em]')}
      />
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="min-h-11 flex-none rounded-input border border-line-3 bg-surface px-3.5 text-[14px] font-semibold text-ink transition-colors hover:border-ink"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
