'use client';
import { useEffect, useState } from 'react';
import { Button } from '../primitives/Button';
import { Input } from '../primitives/Input';

export interface DeliverToPopoverProps {
  schema: 'US' | 'IN';
  postcodeLabel: string;
  locationText: string;
  /** stacked = desktop two-line block; inline = mobile "Deliver to Monish · Bengaluru" line. */
  layout?: 'stacked' | 'inline';
  userName?: string;
}

/** Deliver-to trigger + "Choose your location" dialog (design.md §5 Header). Presentational — no geocoding. */
export function DeliverToPopover({ postcodeLabel, locationText, layout = 'stacked', userName }: DeliverToPopoverProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {layout === 'stacked' ? (
        <button type="button" onClick={() => setOpen(true)} className="flex flex-none flex-col rounded-chip px-1 py-0.5 text-left leading-[1.25] hover:bg-surface-2">
          <span className="text-[12px] text-ink-3">Deliver to</span>
          <span className="text-[14px] font-semibold text-ink">{locationText}</span>
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="min-h-8 self-start text-left text-[13px] text-ink-3">
          Deliver to <strong className="font-semibold text-ink">{userName ? `${userName} · ` : ''}{locationText}</strong>
        </button>
      )}
      {open ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-scrim md:items-center md:p-6" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose your location"
            className="flex w-full max-w-[440px] flex-col gap-4 rounded-t-[18px] bg-bg p-6 text-ink md:rounded-tray"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 text-[20px] font-semibold">Choose your location</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full border border-line-3 bg-surface text-[18px]">×</button>
            </div>
            <p className="m-0 text-[14px] text-ink-2">Sign in to see your addresses, or enter a {postcodeLabel.toLowerCase()} to see delivery times.</p>
            <div className="flex items-end gap-2">
              <div className="flex-1"><Input label={postcodeLabel} inputMode="numeric" autoComplete="postal-code" /></div>
              <Button variant="secondary">Apply</Button>
            </div>
            <div className="flex justify-end"><Button onClick={() => setOpen(false)}>Done</Button></div>
          </div>
        </div>
      ) : null}
    </>
  );
}
