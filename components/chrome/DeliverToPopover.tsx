'use client';
import { useState } from 'react';
import { IconPin } from '../icons/index';
import { Button } from '../primitives/Button';
import { Input } from '../primitives/Input';

export interface DeliverToPopoverProps {
  schema: 'US' | 'IN';
  postcodeLabel: string;
  locationText: string;
}

/** Deliver-to trigger + "Choose your location" modal; label differs by store (design.md §13). Presentational — no real geocoding yet. */
export function DeliverToPopover({ schema, postcodeLabel, locationText }: DeliverToPopoverProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-[3px] px-2 py-1 text-left leading-[14px] hover:outline hover:outline-1 hover:outline-white">
        <span className="flex items-center gap-0.5 text-[12px] text-[#ccc]"><IconPin width={12} height={12} /> {schema === 'IN' ? 'Delivering to' : 'Deliver to'}</span>
        <span className="text-[14px] font-bold text-white">{schema === 'IN' ? locationText : locationText}</span>
      </button>
      {open ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-[rgb(0_0_0_/_0.6)] pt-24" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="Choose your location" className="w-[400px] max-w-[92vw] rounded-[8px] bg-white p-5 text-ink shadow-dropdown" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-[18px] font-bold">Choose your location</h2>
            <p className="mb-3 text-[13px] text-ink-2">Sign in to see your addresses, or enter a {postcodeLabel.toLowerCase()}.</p>
            <div className="flex items-end gap-2">
              <Input label={postcodeLabel} inputMode="numeric" className="w-[160px]" />
              <Button variant="secondary">Apply</Button>
            </div>
            <div className="mt-4 text-right"><Button onClick={() => setOpen(false)}>Done</Button></div>
          </div>
        </div>
      ) : null}
    </>
  );
}
