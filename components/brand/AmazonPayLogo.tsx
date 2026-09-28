import { cn } from '../lib/cn';

/**
 * "[ STORE ] pay" — the store's payments mark, built from the wordmark (design.md §5 Wordmark: JetBrains
 * Mono 600, 1.5px dashed border) followed by "pay". No third-party branding. `tone='light'` draws it
 * white for ink panels. The export name is kept so existing imports (home PayStrip) keep working.
 */
export function AmazonPayLogo({ className, tone = 'dark' }: { className?: string; tone?: 'light' | 'dark' }) {
  const light = tone === 'light';
  return (
    <span
      role="img"
      aria-label="Store Pay"
      className={cn('inline-flex h-[28px] select-none items-center gap-1.5', light ? 'text-white' : 'text-ink', className)}
    >
      <span
        aria-hidden
        className={cn(
          'inline-flex h-full items-center border-[1.5px] border-dashed px-2 font-mono text-[13px] font-semibold tracking-[0.08em]',
          light ? 'border-white' : 'border-ink',
        )}
      >
        [ STORE ]
      </span>
      <span aria-hidden className="text-[18px] font-semibold leading-none tracking-[-0.01em]">pay</span>
    </span>
  );
}

/** Neutral alias for new code. */
export { AmazonPayLogo as PayMark };
