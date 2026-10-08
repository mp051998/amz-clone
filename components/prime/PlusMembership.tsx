'use client';
import { useFormStatus } from 'react-dom';
import { joinPlusAction, leavePlusAction, setPlusPlanAction, setPlusRenewalAction } from '@/app/actions/plus';
import type { PlusPlanId } from '@/lib/plus-plans';
import { ConfirmAction } from '../admin/ConfirmAction';
import { Button, type ButtonProps } from '../primitives/Button';

type Look = Pick<ButtonProps, 'variant' | 'size' | 'block'>;

function Submit({ label, pendingLabel, variant, size, block }: { label: string; pendingLabel: string } & Look) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} block={block} loading={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Join Plus for a signed-in shopper (free in this demo), on `plan` (monthly when left out). */
export function JoinPlusButton({ label = 'Join Plus', plan, variant = 'primary', size, block }: { label?: string; plan?: PlusPlanId } & Look) {
  return (
    <form action={joinPlusAction} className={block ? 'flex' : 'contents'}>
      {plan ? <input type="hidden" name="plan" value={plan} /> : null}
      <Submit label={label} pendingLabel="Joining…" variant={variant} size={size} block={block} />
    </form>
  );
}

/** Switch to `plan` from the next renewal on (the member's current plan cancels a switch). */
export function SwitchPlanButton({ plan, label, variant = 'secondary' }: { plan: PlusPlanId; label: string } & Pick<ButtonProps, 'variant'>) {
  return (
    <form action={setPlusPlanAction} className="contents">
      <input type="hidden" name="plan" value={plan} />
      <Submit label={label} pendingLabel="Saving…" variant={variant} />
    </form>
  );
}

/** Turn renewal on or off. */
export function RenewalButton({ renew, label, variant = 'secondary' }: { renew: boolean; label: string } & Pick<ButtonProps, 'variant'>) {
  return (
    <form action={setPlusRenewalAction} className="contents">
      <input type="hidden" name="renew" value={renew ? '1' : '0'} />
      <Submit label={label} pendingLabel="Saving…" variant={variant} />
    </form>
  );
}

/** End the membership at once, after a second click. */
export function LeavePlusButton({ label = 'End membership' }: { label?: string }) {
  return (
    <ConfirmAction
      action={leavePlusAction}
      label={label}
      prompt="End Plus now? Delivery charges apply again from your next order."
      confirmLabel="End membership"
      pendingLabel="Ending…"
      cancelLabel="Keep Plus"
    />
  );
}
