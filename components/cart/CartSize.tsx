import { setSize } from '@/app/actions/cart';

/**
 * A cart line's size, for a product that comes in sizes: "Size [9 ▾] Update". A server-action
 * form like CartProtection, so it works without JS. A line with no size (or one the product no
 * longer comes in) starts on "Select" and can't go to checkout until one is picked.
 */
export function CartSize({ id, size, sizes, name }: { id: string; size?: string; sizes: string[]; name: string }) {
  const current = size && sizes.includes(size) ? size : '';
  const fieldId = `size-${id}`;
  return (
    <form action={setSize} className="flex flex-wrap items-center gap-2 text-[14px]">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={fieldId} className="text-ink-2">Size</label>
      <select
        id={fieldId}
        name="size"
        defaultValue={current}
        required
        aria-label={`Size for ${name}`}
        className="min-h-11 rounded-chip border border-line-3 bg-surface px-2.5 text-[14px] text-ink"
      >
        {current ? null : <option value="" disabled>Select</option>}
        {sizes.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <button type="submit" className="min-h-11 px-1 text-[14px] text-ink underline underline-offset-2 hover:text-accent-ink" aria-label={`Update size for ${name}`}>
        Update
      </button>
    </form>
  );
}
