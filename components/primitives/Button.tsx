import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

type Variant = 'yellow' | 'orange' | 'secondary' | 'dark';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANT: Record<Variant, string> = {
  yellow: 'bg-cta-yellow hover:bg-cta-yellow-hover text-ink border-[#FCD200]',
  orange: 'bg-cta-orange hover:bg-cta-orange-hover text-ink border-[#FF8F00]',
  secondary: 'bg-white hover:bg-surface-3 text-ink border-line',
  dark: 'bg-nav-main hover:bg-nav-back text-white border-transparent',
};
const SIZE: Record<Size, string> = { sm: 'h-[26px] text-[13px] px-3', md: 'h-[32px] text-[13px] px-4', lg: 'h-[40px] text-[15px] px-5' };

/** Amazon-style pill button (design.md §5 Buttons). 400 weight, 1px border same as fill, hover darkens, focus ring. */
export function Button({ variant = 'yellow', size = 'md', loading = false, disabled, className, children, ...props }: ButtonProps) {
  return (
    <button
      type={props.type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-pill border font-normal leading-none transition-colors duration-100',
        'focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#C8F3FA] focus-visible:border-link-teal',
        'disabled:bg-surface-2 disabled:text-ink-4 disabled:border-line disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {loading ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink border-t-transparent" aria-hidden /> : children}
    </button>
  );
}
