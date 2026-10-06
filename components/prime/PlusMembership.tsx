'use client';
import { useFormStatus } from 'react-dom';
import { joinPlusAction, leavePlusAction } from '@/app/actions/plus';
import { ConfirmAction } from '../admin/ConfirmAction';
import { Button, type ButtonProps } from '../primitives/Button';

function Submit({ label, variant, size, block }: { label: string } & Pick<ButtonProps, 'variant' | 'size' | 'block'>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} block={block} loading={pending}>
      {pending ? 'Joining…' : label}
    </Button>
  );
}

/** Join Plus for a signed-in shopper (free in this demo). */
export function JoinPlusButton({ label = 'Join Plus', variant = 'primary', size, block }: { label?: string } & Pick<ButtonProps, 'variant' | 'size' | 'block'>) {
  return (
    <form action={joinPlusAction} className={block ? 'flex' : 'contents'}>
      <Submit label={label} variant={variant} size={size} block={block} />
    </form>
  );
}

/** End the membership, after a second click. */
export function LeavePlusButton() {
  return (
    <ConfirmAction
      action={leavePlusAction}
      label="End membership"
      prompt="End Plus? Delivery charges apply again from your next order."
      confirmLabel="End membership"
      pendingLabel="Ending…"
      cancelLabel="Keep Plus"
    />
  );
}
