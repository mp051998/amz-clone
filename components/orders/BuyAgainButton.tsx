'use client';
import { useFormStatus } from 'react-dom';
import { addToCart } from '@/app/actions/cart';
import { buttonClasses } from '../primitives/Button';

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

/** One more of a product you've bought, straight into the cart. */
export function BuyAgainButton({ productId, title, label = 'Buy it again', block }: { productId: string; title: string; label?: string; block?: boolean }) {
  return (
    <form action={addToCart} className={block ? 'flex' : 'contents'}>
      <input type="hidden" name="id" value={productId} />
      <input type="hidden" name="qty" value="1" />
      <Submit label={label} title={title} block={block} />
    </form>
  );
}
