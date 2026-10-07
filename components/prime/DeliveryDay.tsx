'use client';
import { useFormStatus } from 'react-dom';
import { setDeliveryDayAction } from '@/app/actions/plus';
import { WEEKDAYS } from '@/lib/delivery-day';
import { Button } from '../primitives/Button';
import { Select } from '../primitives/Select';

function Save({ label, pendingLabel, variant, name, value }: { label: string; pendingLabel: string; variant: 'primary' | 'secondary'; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} name={name} value={value} disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * The member's Delivery Day: pick a day of the week to have orders arrive on together, or turn
 * it off. Checkout then offers it next to standard delivery.
 */
export function DeliveryDayForm({ current }: { current?: number }) {
  return (
    <form action={setDeliveryDayAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[200px]">
        <Select
          label="Delivery Day"
          name="day"
          defaultValue={current ? String(current) : '5'}
          options={WEEKDAYS.map((d, i) => ({ value: String(i + 1), label: d }))}
        />
      </div>
      <Save label={current ? 'Change day' : 'Set Delivery Day'} pendingLabel="Saving…" variant="primary" />
      {current ? <Save label="Turn off" pendingLabel="Saving…" variant="secondary" name="off" value="1" /> : null}
    </form>
  );
}
