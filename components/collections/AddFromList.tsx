'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addToCartQuiet } from '@/app/collections/actions';
import { useToast } from '../decision/Toast';
import { Button } from '../primitives/Button';

/** Add to cart from someone's shared list, staying on the list (works signed out: guest cart). */
export function AddFromList({ productId, productName, inStock }: { productId: string; productName: string; inStock: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const add = () =>
    start(async () => {
      const res = await addToCartQuiet(productId);
      if ('error' in res) {
        toast(res.message ?? "Couldn't add that to your cart");
        return;
      }
      toast('Added to cart');
      router.refresh();
    });
  return (
    <Button variant="primary" onClick={add} loading={pending} disabled={!inStock} aria-label={`Add ${productName} to cart`}>
      {inStock ? 'Add to cart' : 'Out of stock'}
    </Button>
  );
}
