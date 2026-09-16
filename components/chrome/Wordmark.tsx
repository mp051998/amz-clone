import { cn } from '../lib/cn';

/** Amazon wordmark + smile arrow. Unofficial demo clone — not affiliated with Amazon. */
export function Wordmark({ tld = 'com', className }: { tld?: string; className?: string }) {
  return (
    <span className={cn('relative inline-flex select-none items-end leading-none text-white', className)} aria-label="Amazon">
      <span className="text-[27px] font-bold tracking-[-0.05em]">amazon</span>
      {tld ? <span className="mb-[4px] ml-px text-[13px] font-bold tracking-tight">.{tld}</span> : null}
      <svg
        className="pointer-events-none absolute -bottom-[3px] left-[3px] text-brand-orange"
        width="90"
        height="16"
        viewBox="0 0 90 16"
        fill="none"
        aria-hidden
      >
        <path d="M3 6 C 25 16, 62 16, 84 5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <path d="M84 5 L 77 5.6 M84 5 L 82.2 11.4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      </svg>
    </span>
  );
}
