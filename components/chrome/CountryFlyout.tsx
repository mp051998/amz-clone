'use client';
import { useEffect, useRef, useState } from 'react';

export interface CountryFlyoutProps {
  storeName: string;
  countryId: 'US' | 'IN';
}

const STORES = [
  { id: 'US' as const, href: '/', label: 'United States', meta: 'USD · $' },
  { id: 'IN' as const, href: '/in', label: 'India', meta: 'INR · ₹' },
];

/** Compact store switch (US ⇄ India via the /in prefix) for the header (design.md §5 Store switch). */
export function CountryFlyout({ countryId }: CountryFlyoutProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Store: ${countryId === 'IN' ? 'India' : 'United States'}. Change store`}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-9 items-center gap-1 rounded-chip px-2 font-mono text-[12px] font-semibold text-ink hover:bg-surface-2"
      >
        {countryId} <span aria-hidden className="text-[10px] text-ink-3">▾</span>
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-[55] mt-2 w-[240px] rounded-card border border-line bg-surface p-2 shadow-pop">
          <p className="m-0 px-2 pb-1 pt-1 font-mono text-[11px] uppercase tracking-[0.04em] text-ink-3">Shop in</p>
          <ul className="m-0 list-none p-0">
            {STORES.map((s) => (
              <li key={s.id}>
                <a href={s.href} aria-current={s.id === countryId ? 'true' : undefined} className="flex min-h-11 items-center justify-between rounded-input px-2 text-[14px] text-ink no-underline hover:bg-surface-2 hover:text-ink">
                  <span className={s.id === countryId ? 'font-semibold' : ''}>{s.label}</span>
                  <span className="font-mono text-[12px] text-ink-3">{s.id === countryId ? '✓ ' : ''}{s.meta}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
