import { addToCart } from '@/app/actions/cart';
import { cn } from '../lib/cn';
import { SeeOptions } from '../product/SeeOptions';
import { SubmitButton } from '@/components/primitives/SubmitButton';

/**
 * 44px round "+" that adds one unit to the cart (server action, works without JS). Secondary styling so
 * the card's only accent stays the deal tag (design.md §1.4). With `optionsHref` (a product that comes
 * in sizes) it's "See options" instead.
 */
export function QuickAdd({ productId, name, className, optionsHref }: { productId: string; name: string; className?: string; optionsHref?: string }) {
  if (optionsHref) return <SeeOptions href={optionsHref} name={name} className={cn('flex-none', className)} />;
  return (
    <form action={addToCart} className={cn('flex-none', className)}>
      <input type="hidden" name="id" value={productId} />
      <input type="hidden" name="qty" value="1" />
      <SubmitButton
        bare
        aria-label={`Add ${name} to cart`}
        title="Add to cart"
        className="flex h-11 w-11 items-center justify-center rounded-pill border border-line-3 bg-surface text-[22px] leading-none text-ink transition-colors hover:border-ink"
      >
        <span aria-hidden>+</span>
      </SubmitButton>
    </form>
  );
}
