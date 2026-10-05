'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { setDeliverTo, type DeliverToState } from '@/app/actions/deliver-to';
import type { DeliverTo } from '@/lib/deliver-to';
import type { Address } from '@/lib/types';
import { cn } from '../lib/cn';
import { Button } from '../primitives/Button';
import { Input } from '../primitives/Input';

export type SavedPlace = Pick<Address, 'id' | 'name' | 'line1' | 'city' | 'zip' | 'isDefault'>;

export interface DeliverToPopoverProps {
  schema: 'US' | 'IN';
  postcodeLabel: string;
  locationText: string;
  /** stacked = desktop two-line block; inline = mobile "Deliver to Monish · Bengaluru" line. */
  layout?: 'stacked' | 'inline';
  userName?: string;
  /** where things go now (null until picked) */
  current?: DeliverTo | null;
  /** the shopper's saved addresses in this store, default first */
  addresses?: SavedPlace[];
  signInHref?: string;
  addressesHref?: string;
}

/**
 * Deliver-to trigger + "Choose your location" dialog (design.md §5 Header): pick a saved address
 * or type a postcode. Saved per store in a cookie (`setDeliverTo`); no geocoding, so a typed
 * postcode shows on its own and a saved address adds its city.
 */
export function DeliverToPopover({ postcodeLabel, locationText, layout = 'stacked', userName, current, addresses = [], signInHref, addressesHref }: DeliverToPopoverProps) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<DeliverToState, FormData>(setDeliverTo, {});
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const handled = useRef(state.saved);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // a save closes the dialog
  useEffect(() => {
    if (state.saved && state.saved !== handled.current) {
      handled.current = state.saved;
      close();
    }
  }, [state.saved]);

  const isCurrent = (a: SavedPlace) => current?.postcode === a.zip && (!current.city || current.city === a.city);

  return (
    <>
      {layout === 'stacked' ? (
        <button ref={trigger} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="flex flex-none flex-col rounded-chip px-1 py-0.5 text-left leading-[1.25] hover:bg-surface-2">
          <span className="text-[12px] text-ink-3">Deliver to</span>
          <span className="text-[14px] font-semibold text-ink">{locationText}</span>
        </button>
      ) : (
        <button ref={trigger} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="min-h-8 self-start text-left text-[13px] text-ink-3">
          Deliver to <strong className="font-semibold text-ink">{userName ? `${userName} · ` : ''}{locationText}</strong>
        </button>
      )}
      {open ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-scrim md:items-center md:p-6" onClick={close}>
          <div
            ref={dialog}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="deliver-to-h"
            className="flex max-h-[90vh] w-full max-w-[440px] flex-col gap-4 overflow-y-auto rounded-t-[18px] bg-bg p-6 text-ink outline-none md:rounded-tray"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="deliver-to-h" className="m-0 text-[20px] font-semibold">Choose your location</h2>
              <button type="button" onClick={close} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full border border-line-3 bg-surface text-[18px]">×</button>
            </div>
            <p className="m-0 text-[14px] text-ink-2">Delivery options and times can vary by location.</p>

            {addresses.length ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Your addresses">
                {addresses.map((a) => (
                  <li key={a.id}>
                    <form action={action}>
                      <input type="hidden" name="postcode" value={a.zip} />
                      <input type="hidden" name="city" value={a.city} />
                      <button
                        type="submit"
                        disabled={pending}
                        aria-pressed={isCurrent(a)}
                        className={cn(
                          'flex w-full flex-col items-start gap-0.5 rounded-input border bg-surface px-3.5 py-2.5 text-left text-[14px] text-ink',
                          isCurrent(a) ? 'border-2 border-ink' : 'border-line-3 hover:border-ink',
                        )}
                      >
                        <span className="font-semibold">
                          {a.name}
                          {a.isDefault ? <span className="font-normal text-ink-3"> · Default</span> : null}
                        </span>
                        <span className="text-ink-2">{a.line1}, {a.city} {a.zip}</span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : userName ? (
              addressesHref ? <a href={addressesHref} className="self-start text-[14px] text-ink underline underline-offset-2">Add an address</a> : null
            ) : signInHref ? (
              <a href={signInHref} className="self-start text-[14px] text-ink underline underline-offset-2">Sign in to see your addresses</a>
            ) : null}

            <form action={action} className="flex flex-col gap-2" noValidate>
              <span className="text-[13px] text-ink-3">{addresses.length ? `Or enter a ${postcodeLabel}` : `Enter a ${postcodeLabel}`}</span>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <Input
                    name="postcode"
                    label={postcodeLabel}
                    inputMode="numeric"
                    autoComplete="postal-code"
                    defaultValue={current && !addresses.some(isCurrent) ? current.postcode : ''}
                    error={state.error}
                  />
                </div>
                <Button type="submit" variant="secondary" disabled={pending} className="mt-[26px]">
                  {pending ? 'Saving…' : 'Apply'}
                </Button>
              </div>
            </form>
            <div className="flex justify-end">
              <Button onClick={close}>Done</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
