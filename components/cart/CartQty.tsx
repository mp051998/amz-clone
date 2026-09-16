'use client';
import { updateQty } from '@/app/actions/cart';

/** Qty dropdown that submits updateQty on change (design.md cart). Falls back to a Update button without JS. */
export function CartQty({ id, qty }: { id: string; qty: number }) {
  return (
    <form action={updateQty} className="flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <label className="flex items-center">
        <span className="sr-only">Quantity</span>
        <select
          name="qty"
          defaultValue={qty}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="h-[29px] rounded-[8px] border border-line-2 bg-surface-2 px-2 text-[13px] shadow-input hover:bg-surface-3"
        >
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>Qty: {n}</option>
          ))}
        </select>
      </label>
      <noscript><button type="submit" className="text-[12px] text-link-teal underline">Update</button></noscript>
    </form>
  );
}
