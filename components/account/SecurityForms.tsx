'use client';
import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { AccountFormState } from '@/app/actions/account';
import { Alert } from '../primitives/Alert';
import { Button } from '../primitives/Button';
import { Input } from '../primitives/Input';

type Action = (prev: AccountFormState, formData: FormData) => Promise<AccountFormState>;

function Save({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" loading={pending} className="self-start">
      {pending ? 'Saving…' : children}
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
