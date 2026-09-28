'use client';
import { useState } from 'react';
import type { Address } from '@/lib/types';
import { AddressFields } from './AddressFields';
import { OptionCard, StepCard } from './StepCard';

export interface AddressStepProps {
  addresses: Address[];
  isIN: boolean;
  /** prefill for a new address (the account name). */
  defaultName?: string;
  manageHref: string;
}

const NEW = 'new';

function oneLine(a: Address): string {
  return [a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.zip}`].filter(Boolean).join(', ');
}

/**
 * Step 1 — Delivery address. Picks from the address book (radio cards) or a new address typed in
 * place. Either way the form posts the same fields submitCheckout reads (fullName, phone, line1, …):
 * a saved address as hidden inputs, a new one through AddressFields.
 */
export function AddressStep({ addresses, isIN, defaultName, manageHref }: AddressStepProps) {
  const initial = addresses.find((a) => a.isDefault) ?? addresses[0];
  const [choice, setChoice] = useState<string>(initial?.id ?? NEW);
  const [open, setOpen] = useState(false);
  const chosen = addresses.find((a) => a.id === choice);
  const listId = 'checkout-address-options';

  return (
    <StepCard
      n={1}
      title="Delivery address"
      value={chosen ? chosen.name : 'Add a delivery address'}
      sub={chosen ? oneLine(chosen) : 'Enter where this order should go.'}
      toggle={addresses.length ? { open, onToggle: () => setOpen((o) => !o), controls: listId, label: 'delivery address' } : undefined}
    >
      {chosen ? (
        <>
          <input type="hidden" name="fullName" value={chosen.name} />
          <input type="hidden" name="phone" value={chosen.phone} />
          <input type="hidden" name="line1" value={chosen.line1} />
          <input type="hidden" name="line2" value={chosen.line2 ?? ''} />
          <input type="hidden" name="landmark" value={chosen.landmark ?? ''} />
          <input type="hidden" name="city" value={chosen.city} />
          <input type="hidden" name="state" value={chosen.state} />
          <input type="hidden" name="postcode" value={chosen.zip} />
          {chosen.kind ? <input type="hidden" name="addressType" value={chosen.kind} /> : null}
        </>
      ) : null}

      <div id={listId} role="radiogroup" aria-label="Delivery address" className={open ? 'flex flex-col gap-2 sm:pl-[42px]' : 'hidden'}>
        {addresses.map((a) => (
          <OptionCard
            key={a.id}
            name="addressChoice"
            value={a.id}
            checked={choice === a.id}
            onChange={() => { setChoice(a.id); setOpen(false); }}
            label={a.name}
            sub={oneLine(a)}
            badge={a.isDefault ? 'Default' : undefined}
          />
        ))}
        <OptionCard
          name="addressChoice"
          value={NEW}
          checked={choice === NEW}
          onChange={() => { setChoice(NEW); setOpen(false); }}
          label="+ Use a new address"
          sub="Type it in below — it's used for this order only."
        />
        <a href={manageHref} className="self-start py-2 text-[14px] text-ink underline underline-offset-2">Manage your address book</a>
      </div>

      {choice === NEW ? (
        <div className="sm:pl-[42px]">
          <AddressFields isIN={isIN} address={defaultName ? { name: defaultName } : undefined} />
        </div>
      ) : null}
    </StepCard>
  );
}
