import { addToCart } from '@/app/actions/cart';
import { cn } from '../lib/cn';

/**
 * 44px round "+" that adds one unit to the cart (server action, works without JS). Secondary styling so
 * the card's only accent stays the deal tag (design.md §1.4).
 */
export function QuickAdd({ productId, name, className }: { productId: string; name: string; className?: string }) {
  return (
    <form action={addToCart} className={cn('flex-none', className)}>
      <input type="hidden" name="id" value={productId} />
      <input type="hidden" name="qty" value="1" />
      <button
        type="submit"
        aria-label={`Add ${name} to cart`}
        title="Add to cart"
        className="flex h-11 w-11 items-center justify-center rounded-pill border border-line-3 bg-surface text-[22px] leading-none text-ink transition-colors hover:border-ink"
      >
        <span aria-hidden>+</span>
      </button>
    </form>
  );
}
