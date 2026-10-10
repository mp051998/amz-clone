import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SubmitButton } from './SubmitButton';

afterEach(cleanup);

/** a form action that stays pending until `finish()` is called */
function slowAction() {
  let finish = () => {};
  const calls: FormData[] = [];
  const action = (data: FormData) => {
    calls.push(data);
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  };
  return { action, calls, finish: () => act(async () => finish()) };
}

it('is a plain submit button until its form is sent', () => {
  render(
    <form action={async () => {}}>
      <SubmitButton variant="primary" size="lg">Create account</SubmitButton>
    </form>,
  );
  const btn = screen.getByRole('button', { name: 'Create account' });
  expect(btn).toHaveAttribute('type', 'submit');
  expect(btn).toBeEnabled();
  expect(btn).not.toHaveAttribute('aria-busy');
});

it('spins, disables and shows its pending label while the action runs, then recovers', async () => {
  const slow = slowAction();
  render(
    <form action={slow.action}>
      <SubmitButton pendingLabel="Creating your account…">Create account</SubmitButton>
    </form>,
  );
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create account' })));
  const busy = screen.getByRole('button', { name: 'Creating your account…' });
  expect(busy).toBeDisabled();
  expect(busy).toHaveAttribute('aria-busy', 'true');
  expect(slow.calls).toHaveLength(1);

  await slow.finish();
  const done = screen.getByRole('button', { name: 'Create account' });
  expect(done).toBeEnabled();
  expect(done).not.toHaveAttribute('aria-busy');
});

it('keeps its label when no pending label is given', async () => {
  const slow = slowAction();
  render(
    <form action={slow.action}>
      <SubmitButton>Start return</SubmitButton>
    </form>,
  );
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start return' })));
  expect(screen.getByRole('button', { name: 'Start return' })).toHaveAttribute('aria-busy', 'true');
  await slow.finish();
});

it('in a form with several named buttons, only the pressed one spins but all are disabled', async () => {
  const slow = slowAction();
  render(
    <form action={slow.action}>
      <SubmitButton name="status" value="dismissed" variant="secondary">Dismiss</SubmitButton>
      <SubmitButton name="status" value="resolved">Resolve</SubmitButton>
    </form>,
  );
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Resolve' })));
  expect(slow.calls[0].get('status')).toBe('resolved');
  expect(screen.getByRole('button', { name: 'Resolve' })).toHaveAttribute('aria-busy', 'true');
  const other = screen.getByRole('button', { name: 'Dismiss' });
  expect(other).toBeDisabled();
  expect(other).not.toHaveAttribute('aria-busy');
  await slow.finish();
});

it('bare: keeps its own classes, no spinner, dims and stops taking clicks while pending', async () => {
  const slow = slowAction();
  render(
    <form action={slow.action}>
      <SubmitButton bare className="underline" aria-label="Remove Echo Dot">Remove</SubmitButton>
    </form>,
  );
  const btn = screen.getByRole('button', { name: 'Remove Echo Dot' });
  expect(btn).toHaveClass('underline');
  expect(btn.className).not.toContain('rounded-pill');
  await act(async () => fireEvent.click(btn));
  expect(btn).toBeDisabled();
  expect(btn).toHaveAttribute('aria-busy', 'true');
  expect(btn).toHaveClass('opacity-60');
  expect(btn.querySelector('.animate-spin')).toBeNull();
  await slow.finish();
  expect(btn).toBeEnabled();
});

it('stays disabled when the caller disables it', () => {
  render(
    <form action={async () => {}}>
      <SubmitButton disabled>Subscribe</SubmitButton>
    </form>,
  );
  expect(screen.getByRole('button', { name: 'Subscribe' })).toBeDisabled();
});
