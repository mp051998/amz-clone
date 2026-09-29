import { updateQty } from '@/app/actions/cart';

/**
 * −/+ quantity stepper pill (44px) — two tiny server-action forms, so it works without JS.
 * − at 1 removes the line (updateQty with qty 0); + stops at `max` (stock, capped at 30).
 */
export function CartQty({ id, qty, max = 10, name }: { id: string; qty: number; max?: number; name?: string }) {
  const label = name ? ` ${name}` : '';
  const btn =
    'flex h-11 w-11 items-center justify-center bg-surface text-[18px] leading-none text-ink transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-ink-4 disabled:hover:bg-surface';
  return (
    <div className="flex items-center overflow-hidden rounded-pill border border-line-3" role="group" aria-label={`Quantity${label}`}>
      <form action={updateQty}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="qty" value={Math.max(0, qty - 1)} />
        <button type="submit" className={btn} aria-label={qty <= 1 ? `Remove${label}` : `Decrease quantity${label}`}>−</button>
      </form>
      <span className="min-w-7 text-center font-semibold tabular-nums" aria-live="polite">
        <span className="sr-only">Quantity </span>{qty}
      </span>
      <form action={updateQty}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="qty" value={qty + 1} />
        <button type="submit" className={btn} disabled={qty >= max} aria-label={`Increase quantity${label}`}>+</button>
      </form>
    </div>
  );
}
