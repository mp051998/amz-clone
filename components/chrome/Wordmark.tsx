import { cn } from '../lib/cn';

/**
 * The store mark: `[ STORE ]` in JetBrains Mono 600 inside a 1.5px dashed ink border
 * (design.md §5 Wordmark). A span — wrap it in the link.
 * The mark is always ink on light.
 */
export function Wordmark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-block select-none whitespace-nowrap border-[1.5px] border-dashed border-ink bg-transparent font-mono font-semibold leading-none tracking-[0.08em] text-ink',
        size === 'sm' ? 'px-[9px] py-[6px] text-[12px]' : 'px-2.5 py-[7px] text-[13px]',
        className,
      )}
    >
      [ STORE ]
    </span>
  );
}
