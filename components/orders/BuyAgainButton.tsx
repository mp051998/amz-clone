'use client';
import { useFormStatus } from 'react-dom';
import { addToCart } from '@/app/actions/cart';
import { buttonClasses } from '../primitives/Button';
import { SeeOptions } from '../product/SeeOptions';

function Submit({ label, title, block }: { label: string; title: string; block?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      aria-label={pending ? undefined : `${label}: ${title}`}
      className={buttonClasses({ variant: 'secondary', size: 'sm', block })}
    >
      {pending ? 'Adding…' : label}
    </button>
  );
}

/**
 * One more of a product you've bought, straight into the cart, in the `size` it was bought in. With
 * `optionsHref` (a product that comes in sizes, size unknown) it's "See options" instead.
 */
export function BuyAgainButton({
  productId,
  title,
  label = 'Buy it again',
  block,
  size,
  optionsHref,
}: {
  productId: string;
  title: string;
  label?: string;
  block?: boolean;
  size?: string;
  optionsHref?: string;
}) {
  if (optionsHref) return <SeeOptions href={optionsHref} name={title} block={block} />;
  return (
    <form action={addToCart} className={block ? 'flex' : 'contents'}>
      <input type="hidden" name="id" value={productId} />
      <input type="hidden" name="qty" value="1" />
      {size ? <input type="hidden" name="size" value={size} /> : null}
      <Submit label={label} title={title} block={block} />
    </form>
  );
}
