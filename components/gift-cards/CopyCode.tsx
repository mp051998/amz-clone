'use client';
import { useRef, useState } from 'react';
import { useToast } from '../decision/Toast';
import { fieldClass } from '../lib/controls';
import { cn } from '../lib/cn';

/** A gift card code in a read-only field with a Copy button (selects it when there's no clipboard). */
export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast('Code copied');
    } catch {
      field.current?.select();
    }
  };

  return (
    <div className="flex gap-2">
      <label className="sr-only" htmlFor={`code-${code}`}>Gift card code</label>
      <input
        ref={field}
        id={`code-${code}`}
        readOnly
        value={code}
        onFocus={(e) => e.currentTarget.select()}
        className={cn(fieldClass, 'min-w-0 flex-1 font-mono tracking-[0.04em]')}
      />
      <button
        type="button"
        onClick={copy}
        className="min-h-11 flex-none rounded-input border border-line-3 bg-surface px-3.5 text-[14px] font-semibold text-ink transition-colors hover:border-ink"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
