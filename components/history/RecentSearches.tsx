'use client';
import { useEffect, useState } from 'react';
import { clearRecentSearches, readRecentSearches, removeRecentSearch } from '@/lib/recent-searches';
import type { Market } from '@/lib/types';

/**
 * Browsing history's "Your recent searches": the store's searches kept on this device (the search
 * box offers them), each to run again or remove, and all to clear. Nothing shows without any.
 */
export function RecentSearches({ market, searchPath }: { market: Market; searchPath: string }) {
  const [list, setList] = useState<string[]>([]);
  // this device's: read after mount
  useEffect(() => setList(readRecentSearches(market)), [market]);
  if (!list.length) return null;

  return (
    <section aria-labelledby="recent-searches-h" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="recent-searches-h" className="m-0 text-[18px] font-semibold">Your recent searches</h2>
        <button
          type="button"
          onClick={() => setList(clearRecentSearches(market))}
          className="border-0 bg-transparent p-0 text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink"
        >
          Clear searches
        </button>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {list.map((q) => (
          <li key={q} className="flex max-w-full items-center gap-0.5 rounded-input border border-line bg-surface pl-3 pr-1 text-[14px]">
            <a href={`${searchPath}?${new URLSearchParams({ k: q })}`} className="min-w-0 truncate py-1.5 text-ink no-underline hover:underline">
              {q}
            </a>
            <button
              type="button"
              aria-label={`Remove ${q} from recent searches`}
              onClick={() => setList(removeRecentSearch(market, q))}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full border-0 bg-transparent text-[18px] leading-none text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <span aria-hidden>×</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
