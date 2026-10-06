'use client';
import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { AccountFormState } from '@/app/actions/account';
import { Alert } from '../primitives/Alert';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { Input } from '../primitives/Input';

type Action = (prev: AccountFormState, formData: FormData) => Promise<AccountFormState>;

function Save({ children, pendingLabel = 'Saving…' }: { children: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" loading={pending} className="self-start">
      {pending ? pendingLabel : children}
    </Button>
  );
}

/** One settings card: title, current value, the form, and its result. */
function Card({ id, title, current, state, children }: { id: string; title: string; current?: string; state: AccountFormState; children: ReactNode }) {
  const formError = state.error && !state.field ? state.error : null;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-[18px]">
      <div className="flex flex-col gap-0.5">
        <h2 id={`${id}-title`} className="m-0 text-[17px] font-semibold">{title}</h2>
        {current ? <span className="text-[14px] text-ink-2">{current}</span> : null}
      </div>
      {state.done ? <Alert tone="success">{state.done}</Alert> : null}
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      {children}
    </section>
  );
}

const fieldError = (state: AccountFormState, field: string) => (state.field === field ? state.error : undefined);

export function NameForm({ action, name }: { action: Action; name: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <Card id="name" title="Name" current="Shown on your reviews and orders." state={state}>
      <form action={formAction} className="flex flex-col gap-3.5">
        <Input name="name" label="Your name" defaultValue={name} autoComplete="name" maxLength={80} required error={fieldError(state, 'name')} />
        <Save>Save name</Save>
      </form>
    </Card>
  );
}

export function EmailForm({ action, email }: { action: Action; email: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <Card id="email" title="Email" current={`You sign in with ${email}.`} state={state}>
      <form action={formAction} className="flex flex-col gap-3.5">
        <Input name="email" type="email" label="New email" defaultValue={email} autoComplete="email" required error={fieldError(state, 'email')} />
        <Input
          name="currentPassword"
          type="password"
          label="Current password"
          autoComplete="current-password"
          required
          error={fieldError(state, 'currentPassword')}
        />
        <Save>Change email</Save>
      </form>
    </Card>
  );
}

/** `recovering`: opened from a reset link, so the current password isn't asked for. */
export function PasswordForm({ action, recovering }: { action: Action; recovering: boolean }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <Card
      id="password"
      title={recovering ? 'Set a new password' : 'Password'}
      current={recovering ? 'You opened a reset link, so you don’t need your old password.' : undefined}
      state={state}
    >
      <form action={formAction} className="flex flex-col gap-3.5">
        {recovering ? null : (
          <Input
            name="currentPassword"
            type="password"
            label="Current password"
            autoComplete="current-password"
            required
            error={fieldError(state, 'currentPassword')}
          />
        )}
        <Input
          name="newPassword"
          type="password"
          label="New password"
          autoComplete="new-password"
          minLength={6}
          maxLength={72}
          required
          hint="At least 6 characters."
          error={fieldError(state, 'password')}
        />
        <Input
          name="confirmPassword"
          type="password"
          label="Re-enter new password"
          autoComplete="new-password"
          required
          error={fieldError(state, 'confirmPassword')}
        />
        <Save>{recovering ? 'Set password' : 'Change password'}</Save>
      </form>
    </Card>
  );
}

/**
 * Close the account. `blocked`: why it can't close yet (orders on the way, a return in
 * progress…), shown instead of the form. `losing`: the gift card balance that would go with it.
 */
export function CloseAccountForm({ action, blocked, losing, ordersHref }: { action: Action; blocked?: string | null; losing?: string | null; ordersHref: string }) {
  const [state, formAction] = useActionState(action, {});
  const confirmError = fieldError(state, 'confirm');
  return (
    <Card id="close" title="Close your account" current="Closing your account is permanent. It can’t be reopened." state={state}>
      <div className="flex flex-col gap-2 text-[14px] leading-[1.5] text-ink-2">
        <p className="m-0">
          You’ll lose your saved addresses, cart, lists, browsing history, coupons and Plus membership
          {losing ? <>, and your gift card balance of <strong className="font-semibold text-ink">{losing}</strong></> : null}.
        </p>
        <p className="m-0">
          We keep a record of your orders and returns for our accounts. Reviews, questions and answers you posted stay up under the
          name shown on them.
        </p>
      </div>
      {blocked ? (
        <Alert tone="info">
          {blocked}{' '}
          <a href={ordersHref} className="text-ink underline underline-offset-2">Go to Your Orders</a>
        </Alert>
      ) : (
        <form action={formAction} className="flex flex-col gap-3.5">
          <Input
            name="currentPassword"
            type="password"
            label="Current password"
            autoComplete="current-password"
            required
            error={fieldError(state, 'currentPassword')}
          />
          <div className="flex flex-col gap-1">
            <Checkbox
              name="confirm"
              value="yes"
              label="I understand that closing my account can’t be undone."
              required
              aria-invalid={confirmError ? true : undefined}
              aria-describedby={confirmError ? 'close-confirm-error' : undefined}
            />
            {confirmError ? (
              <span id="close-confirm-error" className="flex items-center gap-1.5 text-[13px] text-bad">
                <span aria-hidden className="font-bold">⚠</span>
                <span>{confirmError}</span>
              </span>
            ) : null}
          </div>
          <Save pendingLabel="Closing…">Close my account</Save>
        </form>
      )}
    </Card>
  );
}
