import { useId } from 'react';
import { Input } from '../primitives/Input';
import { fieldClass, selectClass } from '../lib/controls';
import { cn } from '../lib/cn';
import { addressChecks } from '@/lib/address-patterns';
import { INSTRUCTIONS_MAX } from '@/lib/contracts';
import { DROPOFF, DROPOFF_SPOTS } from '@/lib/dropoff';
import type { Address } from '@/lib/types';

/**
 * The store-aware shipping-address field grid, shared by the checkout form and the
 * address book so both collect exactly the same fields under the same names
 * (fullName / phone / line1 / line2 / landmark / city / state / postcode / addressType / instructions / dropoff).
 * amazon.in adds Area/Landmark lines and a Home/Office delivery-window type; amazon.com
 * uses the leaner US layout. `address` prefills every field when editing or reordering.
 */
export function AddressFields({ isIN, address }: { isIN: boolean; address?: Partial<Address> }) {
  const a = address ?? {};
  const kind = a.kind ?? 'home';
  const check = addressChecks(isIN);

  if (isIN) {
    return (
      <div className="grid max-w-[600px] grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Input name="fullName" {...check.fullName} label="Full name" required defaultValue={a.name ?? ''} placeholder="Enter full name" />
        <Input name="phone" {...check.phone} label="Mobile number" inputMode="numeric" required defaultValue={a.phone ?? ''} placeholder="10-digit mobile number" />
        <div className="sm:col-span-2"><Input name="line1" {...check.line1} label="Flat, House no., Building, Company" required defaultValue={a.line1 ?? ''} placeholder="e.g. 12, Prestige Residency" /></div>
        <div className="sm:col-span-2"><Input name="line2" {...check.line2} label="Area, Street, Sector, Village" required defaultValue={a.line2 ?? ''} placeholder="e.g. Koramangala 4th Block" /></div>
        <div className="sm:col-span-2"><Input name="landmark" label="Landmark (optional)" defaultValue={a.landmark ?? ''} placeholder="e.g. near Forum Mall" /></div>
        <Input name="city" {...check.city} label="Town/City" required defaultValue={a.city ?? ''} placeholder="e.g. Bengaluru" />
        <Input name="state" {...check.state} label="State" required defaultValue={a.state ?? ''} placeholder="e.g. Karnataka" />
        <Input name="postcode" {...check.postcode} label="Pincode" inputMode="numeric" required defaultValue={a.zip ?? ''} placeholder="6-digit pincode" />
        <fieldset className="m-0 border-0 p-0 sm:col-span-2">
          <legend className="mb-1.5 text-[14px] font-semibold text-ink">Address type</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
            <label className="flex min-h-11 cursor-pointer items-center gap-2"><input type="radio" name="addressType" value="home" defaultChecked={kind === 'home'} className="h-[18px] w-[18px] accent-ink" /> Home <span className="text-ink-3">(7 am – 9 pm delivery)</span></label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2"><input type="radio" name="addressType" value="office" defaultChecked={kind === 'office'} className="h-[18px] w-[18px] accent-ink" /> Office <span className="text-ink-3">(10 am – 6 pm delivery)</span></label>
          </div>
        </fieldset>
        <div className="sm:col-span-2"><DropoffField defaultValue={a.dropoff} /></div>
        <div className="sm:col-span-2"><InstructionsField defaultValue={a.instructions} /></div>
      </div>
    );
  }

  return (
    <div className="grid max-w-[600px] grid-cols-1 gap-3.5 sm:grid-cols-2">
      <Input name="fullName" {...check.fullName} label="Full name" required defaultValue={a.name ?? ''} placeholder="Enter full name" />
      <Input name="phone" {...check.phone} label="Phone number" inputMode="numeric" required defaultValue={a.phone ?? ''} placeholder="10-digit phone number" />
      <div className="sm:col-span-2"><Input name="line1" {...check.line1} label="Address" required defaultValue={a.line1 ?? ''} placeholder="Street address" /></div>
      <div className="sm:col-span-2"><Input name="line2" {...check.line2} label="Apt, suite, etc. (optional)" defaultValue={a.line2 ?? ''} /></div>
      <Input name="city" {...check.city} label="City" required defaultValue={a.city ?? ''} placeholder="e.g. Seattle" />
      <Input name="state" {...check.state} label="State" required defaultValue={a.state ?? ''} placeholder="e.g. WA" />
      <Input name="postcode" {...check.postcode} label="ZIP Code" inputMode="numeric" required defaultValue={a.zip ?? ''} placeholder="5-digit ZIP" />
      <div className="sm:col-span-2"><DropoffField defaultValue={a.dropoff} /></div>
      <div className="sm:col-span-2"><InstructionsField defaultValue={a.instructions} /></div>
    </div>
  );
}

/**
 * "Delivery instructions (optional)": a note for the courier, posted as `instructions`. The
 * checkout also shows it on its own under a saved address, where the `hint` says the change is
 * for this order only.
 */
export function InstructionsField({ defaultValue, hint }: { defaultValue?: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-semibold text-ink">Delivery instructions (optional)</label>
      <textarea
        id={id}
        name="instructions"
        defaultValue={defaultValue ?? ''}
        maxLength={INSTRUCTIONS_MAX}
        rows={2}
        placeholder="e.g. Leave it with the front desk. Gate code 4321."
        aria-describedby={`${id}-hint`}
        className={cn(fieldClass, 'h-auto py-2.5 leading-normal')}
      />
      <span id={`${id}-hint`} className="text-[13px] text-ink-3">{hint ?? `Up to ${INSTRUCTIONS_MAX} characters, shown to whoever delivers it.`}</span>
    </div>
  );
}

/**
 * "Where should we leave packages?": the drop-off spot when nobody's there to take a package,
 * posted as `dropoff` (blank: no preference). Like the instructions, the checkout shows it under a
 * saved address too, for that order only.
 */
export function DropoffField({ defaultValue, hint }: { defaultValue?: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-semibold text-ink">Where should we leave packages? (optional)</label>
      <select id={id} name="dropoff" defaultValue={defaultValue ?? ''} aria-describedby={`${id}-hint`} className={cn(selectClass, 'sm:max-w-[320px]')}>
        <option value="">No preference</option>
        {DROPOFF_SPOTS.map((s) => (
          <option key={s} value={s}>{DROPOFF[s].label}</option>
        ))}
      </select>
      <span id={`${id}-hint`} className="text-[13px] text-ink-3">{hint ?? 'When nobody’s there to take a package.'}</span>
    </div>
  );
}
