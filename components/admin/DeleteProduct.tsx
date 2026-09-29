'use client';
import { ConfirmAction } from './ConfirmAction';

/** Two-step delete (only offered for never-ordered products): the first click only asks. */
export function DeleteProduct({ action, name }: { action: () => Promise<void>; name: string }) {
  return (
    <ConfirmAction
      action={action}
      label="Delete permanently"
      prompt={<>Delete <b className="font-semibold">{name}</b>? It comes out of carts and collections too. This can’t be undone.</>}
      confirmLabel="Delete for good"
      pendingLabel="Deleting…"
    />
  );
}
