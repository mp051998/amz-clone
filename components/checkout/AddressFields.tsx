import { Input } from '../primitives/Input';
import type { Address } from '@/lib/types';

/**
 * The store-aware shipping-address field grid, shared by the checkout form and the
 * address book so both collect exactly the same fields under the same names
 * (fullName / phone / line1 / line2 / landmark / city / state / postcode / addressType).
 * amazon.in adds Area/Landmark lines and a Home/Office delivery-window type; amazon.com
 * uses the leaner US layout. `address` prefills every field when editing or reordering.
 */
export function AddressFields({ isIN, address }: { isIN: boolean; address?: Partial<Address> }) {
  const a = address ?? {};
  const kind = a.kind ?? 'home';

  if (isIN) {
    return (
      <div className="grid max-w-[600px] grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Input name="fullName" label="Full name" required defaultValue={a.name ?? ''} placeholder="Enter full name" />
        <Input name="phone" label="Mobile number" inputMode="numeric" required defaultValue={a.phone ?? ''} placeholder="10-digit mobile number" />
        <div className="sm:col-span-2"><Input name="line1" label="Flat, House no., Building, Company" required defaultValue={a.line1 ?? ''} placeholder="e.g. 12, Prestige Residency" /></div>
        <div className="sm:col-span-2"><Input name="line2" label="Area, Street, Sector, Village" required defaultValue={a.line2 ?? ''} placeholder="e.g. Koramangala 4th Block" /></div>
        <div className="sm:col-span-2"><Input name="landmark" label="Landmark (optional)" defaultValue={a.landmark ?? ''} placeholder="e.g. near Forum Mall" /></div>
        <Input name="city" label="Town/City" required defaultValue={a.city ?? ''} placeholder="e.g. Bengaluru" />
        <Input name="state" label="State" required defaultValue={a.state ?? ''} placeholder="e.g. Karnataka" />
        <Input name="postcode" label="Pincode" inputMode="numeric" required defaultValue={a.zip ?? ''} placeholder="6-digit pincode" />
        <fieldset className="m-0 border-0 p-0 sm:col-span-2">
          <legend className="mb-1.5 text-[14px] font-semibold text-ink">Address type</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
            <label className="flex min-h-11 cursor-pointer items-center gap-2"><input type="radio" name="addressType" value="home" defaultChecked={kind === 'home'} className="h-[18px] w-[18px] accent-ink" /> Home <span className="text-ink-3">(7 am – 9 pm delivery)</span></label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2"><input type="radio" name="addressType" value="office" defaultChecked={kind === 'office'} className="h-[18px] w-[18px] accent-ink" /> Office <span className="text-ink-3">(10 am – 6 pm delivery)</span></label>
          </div>
        </fieldset>
      </div>
    );
  }

  return (
    <div className="grid max-w-[600px] grid-cols-1 gap-3.5 sm:grid-cols-2">
      <Input name="fullName" label="Full name" required defaultValue={a.name ?? ''} placeholder="Enter full name" />
      <Input name="phone" label="Phone number" inputMode="numeric" required defaultValue={a.phone ?? ''} placeholder="10-digit phone number" />
      <div className="sm:col-span-2"><Input name="line1" label="Address" required defaultValue={a.line1 ?? ''} placeholder="Street address" /></div>
      <div className="sm:col-span-2"><Input name="line2" label="Apt, suite, etc. (optional)" defaultValue={a.line2 ?? ''} /></div>
      <Input name="city" label="City" required defaultValue={a.city ?? ''} placeholder="e.g. Seattle" />
      <Input name="state" label="State" required defaultValue={a.state ?? ''} placeholder="e.g. WA" />
      <Input name="postcode" label="ZIP Code" inputMode="numeric" required defaultValue={a.zip ?? ''} placeholder="5-digit ZIP" />
    </div>
  );
}
