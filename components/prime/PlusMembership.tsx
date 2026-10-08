'use client';
import { useFormStatus } from 'react-dom';
import {
  acceptPlusInviteAction,
  declinePlusInviteAction,
  invitePlusHouseholdAction,
  joinPlusAction,
  leavePlusAction,
  leavePlusHouseholdAction,
  setPlusPlanAction,
  setPlusRenewalAction,
  stopSharingPlusAction,
} from '@/app/actions/plus';
import type { PlusPlanId } from '@/lib/plus-plans';
import { ConfirmAction } from '../admin/ConfirmAction';
import { Button, type ButtonProps } from '../primitives/Button';
import { fieldClass } from '../lib/controls';

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

/** Invite an adult, by email, to share the member's Plus. */
export function HouseholdInviteForm() {
  return (
    <form action={invitePlusHouseholdAction} className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-[240px] flex-1 flex-col gap-1.5 text-[14px] font-semibold md:max-w-[360px]">
        Their email
        <input type="email" name="email" required autoComplete="off" placeholder="name@example.com" className={fieldClass} />
      </label>
      <Submit label="Send invite" pendingLabel="Sending…" variant="primary" />
    </form>
  );
}

/** Stop sharing with the adult who joined, after a second click; a waiting invite cancels at once. */
export function StopSharingButton({ name, joined }: { name: string; joined: boolean }) {
  return joined ? (
    <ConfirmAction
      action={stopSharingPlusAction}
      label="Stop sharing"
      prompt={`Stop sharing Plus with ${name}? Delivery charges apply to their orders again.`}
      confirmLabel="Stop sharing"
      pendingLabel="Stopping…"
      cancelLabel="Keep sharing"
    />
  ) : (
    <form action={stopSharingPlusAction} className="contents">
      <Submit label="Cancel invite" pendingLabel="Cancelling…" variant="secondary" />
    </form>
  );
}

/** Accept or decline the invite from `owner`. */
export function InviteReplyButton({ owner, accept }: { owner: string; accept: boolean }) {
  return (
    <form action={accept ? acceptPlusInviteAction : declinePlusInviteAction} className="contents">
      <input type="hidden" name="owner" value={owner} />
      <Submit label={accept ? 'Accept' : 'Decline'} pendingLabel={accept ? 'Joining…' : 'Declining…'} variant={accept ? 'primary' : 'secondary'} />
    </form>
  );
}

/** Leave the household whose Plus the shopper shares, after a second click. */
export function LeaveHouseholdButton() {
  return (
    <ConfirmAction
      action={leavePlusHouseholdAction}
      label="Leave household"
      prompt="Leave the household? Delivery charges apply again from your next order."
      confirmLabel="Leave household"
      pendingLabel="Leaving…"
      cancelLabel="Stay"
    />
  );
}
