'use client';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '../primitives/Button';

function Confirm() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="dark" size="sm" loading={pending}>
      {pending ? 'Deleting…' : 'Delete for good'}
    </Button>
  );
}

/** Two-step delete: the first click only asks. */
export function DeleteProduct({ action, name }: { action: () => Promise<void>; name: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setAsking(true)}>
        Delete product
      </Button>
    );
  }
  return (
    <form action={action} role="group" aria-label="Confirm delete" className="flex flex-wrap items-center gap-2.5">
      <span className="text-[14px]">
        Delete <b className="font-semibold">{name}</b>? It comes out of carts and collections too. This can’t be undone.
      </span>
      <Confirm />
      <Button variant="link" size="sm" onClick={() => setAsking(false)}>Keep it</Button>
    </form>
  );
}
