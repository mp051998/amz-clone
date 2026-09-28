import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/**
 * `primary` = the one accent (commit: Add to cart, Search, Place order). `dark` = ink fill (Buy now,
 * strong secondary). `secondary` = white + line-3 border. `dashed` = 1.5px dashed ink ("Tune for me…").
 * `link` = underlined text button (design.md §5 Buttons).
 */
export type ButtonVariant = 'primary' | 'dark' | 'secondary' | 'dashed' | 'link';
/** sm 36px · md 44px (touch target) · lg 48px (primary page CTA). */
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** stretch to the container width. */
  block?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-ink border-transparent hover:bg-accent-hover',
  dark: 'bg-ink text-white border-transparent hover:bg-ink-raised',
  secondary: 'bg-surface text-ink border-line-3 hover:border-ink',
  dashed: 'bg-surface text-ink border-[1.5px] border-dashed border-ink hover:bg-surface-2',
  link: 'bg-transparent text-ink border-transparent underline underline-offset-2 hover:text-accent-ink !px-0 !h-auto',
};
const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-9 text-[14px] px-3.5',
  md: 'min-h-11 text-[14px] px-4',
  lg: 'min-h-12 text-[16px] px-5',
};

/** Class string for anything that should *look* like a Button (e.g. an `<a>`). */
export function buttonClasses({ variant = 'primary', size = 'md', block = false }: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean } = {}): string {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-pill border font-semibold leading-none transition-colors duration-100 no-underline',
    'disabled:cursor-not-allowed disabled:bg-surface-4 disabled:text-ink-4 disabled:border-transparent aria-disabled:cursor-not-allowed',
    VARIANT[variant],
    variant === 'link' ? 'font-medium' : SIZE[size],
    block && 'w-full',
  );
}

/** Pill button in the decision-store language (design.md §5 Buttons). */
export function Button({ variant = 'primary', size = 'md', loading = false, block = false, disabled, className, children, ...props }: ButtonProps) {
  return (
    <button
      type={props.type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses({ variant, size, block }), className)}
      {...props}
    >
      {loading ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
}
