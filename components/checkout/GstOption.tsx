'use client';
import { useId, useState } from 'react';
import { Checkbox } from '../primitives/Checkbox';
import { fieldClass } from '../lib/controls';
import { cn } from '../lib/cn';

/**
 * amazon.in's "Use GST invoice" (checkout Delivery step, India only): a business buyer's GSTIN and
 * business name, so the invoice is made out to them. Unchecked, nothing is sent.
 */
export function GstOption({ nameMax }: { nameMax: number }) {
  const [on, setOn] = useState(false);
  const gstinId = useId();
  const nameId = useId();
  return (
    <div className="flex flex-col gap-1.5 border-t border-line-2 pt-2">
      <Checkbox name="gst" label="Use GST invoice for a business purchase" checked={on} onChange={(e) => setOn(e.target.checked)} />
      {on ? (
        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] text-ink-3">The invoice is made out to your business, so you can claim input tax credit.</span>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={gstinId} className="text-[14px] font-semibold">GSTIN</label>
            <input
              id={gstinId}
              name="gstin"
              required
              minLength={15}
              maxLength={15}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="22AAAAA0000A1Z5"
              aria-describedby={`${gstinId}-hint`}
              className={cn(fieldClass, 'font-mono uppercase')}
            />
            <span id={`${gstinId}-hint`} className="text-[13px] text-ink-3">15 characters, as on your GST registration certificate.</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={nameId} className="text-[14px] font-semibold">Business name</label>
            <input id={nameId} name="gstName" required maxLength={nameMax} autoComplete="organization" className={fieldClass} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
