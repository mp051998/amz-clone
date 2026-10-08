import type { Address, PaymentMethod } from '@/lib/types';
import { SNS_METHOD_LABEL } from '@/lib/subscribe-save';

/** "1 Main St, Apt 2, Seattle, WA 98101" */
export function addressLine(a: Address): string {
  return [a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.zip}`].filter(Boolean).join(', ');
}

/** The shopper's addresses as radios (`address`), one chosen. */
export function AddressChoices({ addresses, chosen }: { addresses: Address[]; chosen?: string }) {
  return (
    <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
      <legend className="mb-1.5 p-0 text-[15px] font-semibold">Deliver to</legend>
      {addresses.map((a) => (
        <label key={a.id} className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1.5 text-[14px]">
          <input type="radio" name="address" value={a.id} defaultChecked={a.id === chosen} required className="mt-0.5 h-[18px] w-[18px] flex-none accent-ink" />
          <span className="flex flex-col">
            <strong className="font-semibold">{a.name}</strong>
            <span className="text-ink-2">{addressLine(a)}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** The store's subscription payment methods as radios (`method`), with what each has to pay with. */
export function MethodChoices({ methods, chosen, notes = {} }: { methods: PaymentMethod[]; chosen?: string; notes?: Partial<Record<PaymentMethod, string>> }) {
  return (
    <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
      <legend className="mb-1.5 p-0 text-[15px] font-semibold">Pay with</legend>
      {methods.map((m) => (
        <label key={m} className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1.5 text-[14px]">
          <input type="radio" name="method" value={m} defaultChecked={m === chosen} required className="mt-0.5 h-[18px] w-[18px] flex-none accent-ink" />
          <span className="flex flex-col">
            <strong className="font-semibold">{SNS_METHOD_LABEL[m] ?? m}</strong>
            {notes[m] ? <span className="text-ink-2">{notes[m]}</span> : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
