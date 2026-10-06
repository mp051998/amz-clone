'use client';
import { useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '../primitives/Button';

function Confirm({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="dark" size="sm" loading={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export interface ConfirmActionProps {
  action: () => Promise<void>;
  /** the first button. */
  label: string;
  /** what the second step says, e.g. "Delete <b>Lamps</b>? This can't be undone." */
  prompt: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  cancelLabel?: string;
  size?: 'sm' | 'link';
}

/** Two-step destructive action: the first click only asks. */
export function ConfirmAction({ action, label, prompt, confirmLabel, pendingLabel, cancelLabel = 'Keep it', size = 'sm' }: ConfirmActionProps) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant={size === 'link' ? 'link' : 'secondary'} size="sm" onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <form action={action} role="group" aria-label={label} className="flex flex-wrap items-center gap-2.5">
      <span className="text-[14px]">{prompt}</span>
      <Confirm label={confirmLabel} pendingLabel={pendingLabel} />
      <Button variant="link" size="sm" onClick={() => setAsking(false)}>{cancelLabel}</Button>
    </form>
  );
}
