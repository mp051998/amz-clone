'use client';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { claimDemoGiftCardAction, redeemGiftCardAction, type RedeemState } from '@/app/actions/gift-cards';
import { Alert } from '../primitives/Alert';
import { Button } from '../primitives/Button';
import { fieldClass } from '../lib/controls';
import { cn } from '../lib/cn';

function Submit({ label, pendingLabel, variant }: { label: string; pendingLabel: string; variant: 'dark' | 'primary' }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} loading={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Issue this account's demo gift card for the store (one per account). */
export function ClaimDemoButton({ label }: { label: string }) {
  return (
    <form action={claimDemoGiftCardAction}>
      <Submit label={label} pendingLabel="Getting your card…" variant="primary" />
    </form>
  );
}

/** Claim code → balance. `code` prefills a demo card the shopper hasn't redeemed yet. */
export function RedeemForm({ code = '' }: { code?: string }) {
  const [state, action] = useActionState<RedeemState, FormData>(redeemGiftCardAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="gift-code" className="sr-only">Gift card code</label>
        <input
          id="gift-code"
          name="code"
          defaultValue={code}
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXX-XXXXXX-XXXX"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error || state.done ? 'gift-code-result' : undefined}
          className={cn(fieldClass, 'flex-1 font-mono uppercase')}
        />
        <Submit label="Redeem" pendingLabel="Redeeming…" variant="dark" />
      </div>
      {state.error || state.done ? (
        <div id="gift-code-result">
          <Alert tone={state.error ? 'error' : 'success'}>{state.error ?? state.done}</Alert>
        </div>
      ) : null}
    </form>
  );
}
