'use client';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '../lib/cn';
import { Button, type ButtonSize, type ButtonVariant } from './Button';

export interface SubmitButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** what the button reads while its form's action runs (it keeps its label otherwise). */
  pendingLabel?: ReactNode;
  /**
   * Keep the caller's own `className` instead of the Button look (text links, icon buttons): no
   * spinner, it just dims and stops taking clicks while the form submits.
   */
  bare?: boolean;
}

/**
 * A form's submit button that shows the form is working: while its server action runs it is busy
 * (spinner, `aria-busy`, optional `pendingLabel`) and every submit button in the form is disabled, so
 * a slow action (creating an account, placing an order) neither looks frozen nor gets sent twice.
 * In a form with several named submit buttons only the one that was pressed spins.
 */
export function SubmitButton({ variant = 'primary', size = 'md', block, pendingLabel, bare, disabled, className, children, ...props }: SubmitButtonProps) {
  const { pending, data } = useFormStatus();
  const pressed = pending && (props.name == null || data?.get(props.name) === String(props.value ?? ''));
  const label = pressed && pendingLabel != null ? pendingLabel : children;
  if (bare) {
    return (
      <button
        type="submit"
        disabled={disabled || pending}
        aria-busy={pressed || undefined}
        className={cn(className, pending && 'cursor-progress opacity-60')}
        {...props}
      >
        {label}
      </button>
    );
  }
  return (
    <Button type="submit" variant={variant} size={size} block={block} loading={pressed} disabled={disabled || pending} className={className} {...props}>
      {label}
    </Button>
  );
}
