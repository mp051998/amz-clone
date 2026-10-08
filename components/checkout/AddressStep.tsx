'use client';
import { useState } from 'react';
import type { Address, PickupPoint } from '@/lib/types';
import { Input } from '../primitives/Input';
import { addressChecks } from '@/lib/address-patterns';
import { AddressFields, DropoffField, InstructionsField } from './AddressFields';
import { OptionCard, StepCard } from './StepCard';

export interface AddressStepProps {
  addresses: Address[];
  isIN: boolean;
  /** prefill for a new address (the account name). */
  defaultName?: string;
  manageHref: string;
  /** the store's Hub Lockers and Counters, nearest the shopper's default address first */
  pickupPoints?: PickupPoint[];
}

const NEW = 'new';
const PICKUP = 'pickup:';

function oneLine(a: Address): string {
  return [a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.zip}`].filter(Boolean).join(', ');
}

function pointLine(p: PickupPoint): string {
  return `${p.line1}, ${p.city} ${p.postcode}`;
}

/**
 * Step 1 — Delivery address. Picks from the address book (radio cards) or a new address typed in
 * place. Either way the form posts the same fields submitCheckout reads (fullName, phone, line1, …):
 * a saved address as hidden inputs (its drop-off spot and delivery instructions stay editable, for this order only),
 * a new one through AddressFields. Or a pickup point (Hub Locker or Counter): its id as
 * `pickupPoint`, with the name and phone of who collects it; the point's address stands in.
 */
export function AddressStep({ addresses, isIN, defaultName, manageHref, pickupPoints = [] }: AddressStepProps) {
  const initial = addresses.find((a) => a.isDefault) ?? addresses[0];
  const [choice, setChoice] = useState<string>(initial?.id ?? NEW);
  const [open, setOpen] = useState(false);
  const chosen = addresses.find((a) => a.id === choice);
  const point = choice.startsWith(PICKUP) ? pickupPoints.find((p) => PICKUP + p.id === choice) : undefined;
  const listId = 'checkout-address-options';
  const check = addressChecks(isIN);

  return (
    <StepCard
      n={1}
      title="Delivery address"
      value={chosen ? chosen.name : point ? `Pick up at ${point.name}` : 'Add a delivery address'}
      sub={chosen ? oneLine(chosen) : point ? `${pointLine(point)} · ${point.hours}` : 'Enter where this order should go.'}
      toggle={addresses.length || pickupPoints.length ? { open, onToggle: () => setOpen((o) => !o), controls: listId, label: 'delivery address' } : undefined}
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

      {chosen ? (
        <div className={open ? 'hidden' : 'flex flex-col gap-3.5 sm:pl-[42px]'}>
          <DropoffField key={`dropoff-${chosen.id}`} defaultValue={chosen.dropoff} hint="For this order. Change the saved spot in your address book." />
          <InstructionsField
            key={chosen.id}
            defaultValue={chosen.instructions}
            hint="For this order. Change the saved note in your address book."
          />
        </div>
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
        {pickupPoints.length ? (
          <>
            <p className="m-0 mt-2 text-[14px] font-semibold text-ink">Or pick it up at a Hub Locker or Counter</p>
            {pickupPoints.map((p) => (
              <OptionCard
                key={p.id}
                name="addressChoice"
                value={PICKUP + p.id}
                checked={choice === PICKUP + p.id}
                onChange={() => { setChoice(PICKUP + p.id); setOpen(false); }}
                label={p.name}
                sub={`${pointLine(p)} · ${p.hours}${p.kind === 'locker' ? ' · no cash' : ''}`}
                badge={p.kind === 'locker' ? 'Locker' : 'Counter'}
              />
            ))}
          </>
        ) : null}
        <a href={manageHref} className="self-start py-2 text-[14px] text-ink underline underline-offset-2">Manage your address book</a>
      </div>

      {point ? (
        <div className={open ? 'hidden' : 'flex flex-col gap-3 sm:pl-[42px]'}>
          <input type="hidden" name="pickupPoint" value={point.id} />
          <p className="m-0 text-[14px] text-ink-2">
            We’ll send a pickup code when it’s ready. {point.kind === 'locker' ? 'The locker is open around the clock' : 'The counter keeps its hours'} and holds it for {point.holdDays} days.
          </p>
          <div className="grid max-w-[600px] grid-cols-1 gap-3.5 sm:grid-cols-2">
            <Input name="fullName" {...check.fullName} label="Who’s collecting it" required defaultValue={initial?.name ?? defaultName ?? ''} placeholder="Full name" />
            <Input name="phone" {...check.phone} label={isIN ? 'Mobile number' : 'Phone number'} inputMode="numeric" required defaultValue={initial?.phone ?? ''} placeholder="For the pickup code" />
          </div>
        </div>
      ) : null}

      {choice === NEW ? (
        <div className="sm:pl-[42px]">
          <AddressFields isIN={isIN} address={defaultName ? { name: defaultName } : undefined} />
        </div>
      ) : null}
    </StepCard>
  );
}
