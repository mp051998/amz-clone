import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface PillProps {
  children: ReactNode;
  /** selected = ink fill + white text. */
  selected?: boolean;
  href?: string;
  onClick?: () => void;
  /** 'md' = 40px refine chips; 'sm' = 34px example/query chips. */
  size?: 'sm' | 'md';
  /** example chips use the softer line-4 border. */
  tone?: 'default' | 'soft';
  /** removable intent chip: renders a × (link or button) after the label. */
  removeHref?: string;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}

/** Chip / filter pill (design.md §5 Chips). Link, button, or static span when no action is given. */
export function Pill({ children, selected = false, href, onClick, size = 'md', tone = 'default', removeHref, onRemove, removeLabel = 'Remove', className }: PillProps) {
  const removable = removeHref != null || onRemove != null;
  const base = cn(
    'inline-flex flex-none items-center gap-1.5 rounded-pill border text-[14px] font-medium no-underline transition-colors',
    size === 'md' ? 'min-h-10 px-[15px]' : 'min-h-[34px] px-3.5',
    removable && (size === 'md' ? 'pr-1.5' : 'pr-1'),
    selected
      ? 'border-ink bg-ink text-on-ink hover:text-on-ink'
      : cn('bg-surface text-ink hover:border-ink hover:text-ink', tone === 'soft' ? 'border-line-4' : 'border-line-3'),
    className,
  );
  const x = removable ? (
    removeHref != null ? (
      <a href={removeHref} aria-label={removeLabel} className={cn('ml-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full text-[13px] leading-none no-underline', selected ? 'bg-ink-raised text-on-ink hover:text-on-ink' : 'bg-surface-2 text-ink')}>×</a>
    ) : (
      <button type="button" onClick={onRemove} aria-label={removeLabel} className={cn('ml-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full text-[13px] leading-none', selected ? 'bg-ink-raised text-on-ink' : 'bg-surface-2 text-ink')}>×</button>
    )
  ) : null;

  if (removable) {
    // the pill itself is static; only the × is interactive (avoids nested interactive elements)
    return <span className={base}>{children}{x}</span>;
  }
  if (href != null) return <a href={href} aria-current={selected ? 'true' : undefined} className={base}>{children}</a>;
  if (onClick) return <button type="button" aria-pressed={selected} onClick={onClick} className={base}>{children}</button>;
  return <span className={base}>{children}</span>;
}
