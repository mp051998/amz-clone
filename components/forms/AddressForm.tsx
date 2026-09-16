'use client';
import { useState, type FormEvent } from 'react';
import { AddressInputSchema, type AddressInput } from '@/lib/contracts';
import { Button } from '../primitives/Button';
import { Input } from '../primitives/Input';
import { Select } from '../primitives/Select';

export interface AddressFormProps {
  schema: 'US' | 'IN';
  onValid?: (address: AddressInput) => void;
}

/** Two-schema address form validated by the shared contract union (design.md §13; @/lib/contracts AddressInputSchema). */
export function AddressForm({ schema, onValid }: AddressFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = Object.fromEntries(fd.entries()) as Record<string, string>;
    const result = AddressInputSchema.safeParse({ ...raw, schema });
    if (result.success) {
      setErrors({});
      onValid?.(result.data);
    } else {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
    }
  }

  return (
    <form onSubmit={submit} className="flex max-w-[420px] flex-col gap-3">
      <Input name="fullName" label="Full name" error={errors.fullName} />
      {schema === 'IN' ? <Input name="phone" label="Mobile number" inputMode="numeric" error={errors.phone} /> : <Input name="phone" label="Phone" inputMode="numeric" error={errors.phone} />}
      {schema === 'IN' ? (
        <>
          <Input name="line1" label="Flat, House no., Building" error={errors.line1} />
          <Input name="line2" label="Area, Street, Sector" error={errors.line2} />
          <Input name="landmark" label="Landmark (optional)" error={errors.landmark} />
          <Input name="city" label="Town/City" error={errors.city} />
          <Input name="state" label="State" error={errors.state} />
          <Input name="postcode" label="Pincode" inputMode="numeric" error={errors.postcode} />
          <Select name="addressType" label="Address type" options={[{ value: 'home', label: 'Home' }, { value: 'office', label: 'Office' }]} />
        </>
      ) : (
        <>
          <Input name="line1" label="Address line 1" error={errors.line1} />
          <Input name="line2" label="Address line 2 (optional)" error={errors.line2} />
          <Input name="city" label="City" error={errors.city} />
          <Input name="state" label="State" error={errors.state} />
          <Input name="postcode" label="ZIP Code" inputMode="numeric" error={errors.postcode} />
        </>
      )}
      <div><Button type="submit">Save address</Button></div>
    </form>
  );
}
