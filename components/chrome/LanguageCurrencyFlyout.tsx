'use client';
import { useState } from 'react';
import { IconChevronDown } from '../icons/index';

export interface LanguageCurrencyFlyoutProps {
  storeName: string;
  languages: string[];
  showCurrency: boolean;
  currencies: string[];
}

/** Language (+ optional currency) flyout. IN has no currency section (design.md §13). */
export function LanguageCurrencyFlyout({ storeName, languages, showCurrency, currencies }: LanguageCurrencyFlyoutProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 rounded-[3px] px-2 py-1 text-[12px] font-bold hover:outline hover:outline-1 hover:outline-white">
        {languages[0]} <IconChevronDown width={12} height={12} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 w-[260px] rounded-[8px] bg-white p-3 text-ink shadow-dropdown">
          <p className="mb-1 text-[14px] font-bold">Change language</p>
          <ul className="mb-2">{languages.map((l) => (<li key={l} className="rounded px-1 py-1 text-[14px] hover:bg-surface-2">{l}</li>))}</ul>
          {showCurrency ? (
            <>
              <p className="mb-1 text-[14px] font-bold">Change currency</p>
              <ul>{currencies.map((c) => (<li key={c} className="rounded px-1 py-1 text-[14px] hover:bg-surface-2">{c}</li>))}</ul>
            </>
          ) : null}
          <p className="mt-2 border-t border-line pt-2 text-[12px] text-ink-2">You are shopping on {storeName} — Change country/region.</p>
        </div>
      ) : null}
    </div>
  );
}
