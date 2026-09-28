'use client';
import { useFormStatus } from 'react-dom';
import { Button } from '../primitives/Button';

/** Accent "Place your order" — must render inside the checkout <form>; spins while the action runs so it can't be double-placed. */
export function PlaceOrderButton({ children = 'Place your order' }: { children?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" block loading={pending} className="mt-1.5 min-h-[50px]">
      {pending ? 'Placing your order…' : children}
    </Button>
  );
}
