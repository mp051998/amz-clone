'use client';
import { useState } from 'react';
import { IconChevronDown } from '../icons/index';

export interface CountryFlyoutProps {
  storeName: string;
  countryId: 'US' | 'IN';
}

const FLAG: Record<'US' | 'IN', string> = { US: '🇺🇸', IN: '🇮🇳' };

/** Country/region switcher — a flag trigger that opens the US ⇄ India store switch
 *  (via the /in prefix). Language selection was intentionally dropped. */
export function CountryFlyout({ storeName, countryId }: CountryFlyoutProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" aria-expanded={open} aria-label="Change country/region" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 rounded-[3px] px-2 py-1 text-[12px] font-bold hover:outline hover:outline-1 hover:outline-white">
        <span aria-hidden className="text-[15px] leading-none">{FLAG[countryId]}</span>
        {countryId} <IconChevronDown width={12} height={12} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 w-[240px] rounded-[8px] bg-white p-3 text-ink shadow-dropdown">
          <p className="mb-1 text-[14px] font-bold">Change country/region</p>
          <ul className="space-y-0.5">
            <li>
              <a href="/" className={`flex items-center gap-2 rounded px-1 py-1 text-[14px] hover:bg-surface-2 ${countryId === 'US' ? 'font-bold' : ''}`}>
                <span aria-hidden>🇺🇸</span> United States {countryId === 'US' ? <span className="text-ink-3">✓</span> : null}
              </a>
            </li>
            <li>
              <a href="/in" className={`flex items-center gap-2 rounded px-1 py-1 text-[14px] hover:bg-surface-2 ${countryId === 'IN' ? 'font-bold' : ''}`}>
                <span aria-hidden>🇮🇳</span> India {countryId === 'IN' ? <span className="text-ink-3">✓</span> : null}
              </a>
            </li>
          </ul>
          <p className="mt-2 border-t border-line pt-2 text-[12px] text-ink-2">You are shopping on {storeName}{countryId === 'IN' ? '.in' : '.com'}.</p>
        </div>
      ) : null}
    </div>
  );
}
