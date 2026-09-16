import { cn } from '../lib/cn';

/**
 * Amazon wordmark + smile arrow, drawn as vector.
 * The smile is a single filled swoosh — tapered at the 'a' end, flaring into an
 * up-right arrowhead under the 'z'. Original vector rendition for an unofficial
 * demo clone — not affiliated with Amazon.
 */
export function Wordmark({ tld = 'com', className, tone = 'light' }: { tld?: string; className?: string; tone?: 'light' | 'dark' }) {
  return (
    <span className={cn('relative inline-flex select-none items-end leading-none', tone === 'dark' ? 'text-ink' : 'text-white', className)} aria-label="Amazon">
      <span className="text-[26px] font-bold tracking-[-0.045em]">amazon</span>
      {tld ? <span className="mb-[3.5px] ml-[1px] text-[12.5px] font-bold tracking-[-0.02em]">.{tld}</span> : null}
      <svg
        className="pointer-events-none absolute -bottom-[4px] left-[2px] text-brand-orange"
        width="90"
        height="20"
        viewBox="0 0 90 20"
        fill="none"
        aria-hidden
      >
        <path
          fill="currentColor"
          d="M2.4 5.2
             C 21 13, 50 14.6, 70.5 7.7
             L 67 4.4
             L 84 6.3
             L 77.6 18.3
             L 75.2 12.4
             C 51 19.8, 20 18, 1 8.1
             Z"
        />
      </svg>
    </span>
  );
}
