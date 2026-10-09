import type { Market } from './types';

/**
 * Recent searches, per store, kept on this device (localStorage), newest first: the search box
 * offers them when it's empty and when what's typed starts one. Pausing browsing history stops
 * new ones being added; each can be removed from the box.
 */
export const RECENT_SEARCHES_MAX = 8;
/** longest search kept (the box takes more, but nobody needs it back) */
const LONGEST = 100;

const key = (market: Market) => `search:recent:v1:${market}`;

/** "  Sony   headphones " → "Sony headphones"; empty when there's nothing to keep. */
export function cleanSearch(q: string): string {
  return q.trim().replace(/\s+/g, ' ').slice(0, LONGEST);
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function readRecentSearches(market: Market): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(key(market)) ?? '[]');
    if (!Array.isArray(list)) return [];
    const out: string[] = [];
    for (const item of list) {
      const q = typeof item === 'string' ? cleanSearch(item) : '';
      if (q && !out.some((x) => same(x, q))) out.push(q);
    }
    return out.slice(0, RECENT_SEARCHES_MAX);
  } catch {
    return []; // storage blocked or garbled: nothing to offer
  }
}

function write(market: Market, list: string[]): string[] {
  try {
    if (list.length) localStorage.setItem(key(market), JSON.stringify(list));
    else localStorage.removeItem(key(market));
  } catch {
    /* storage blocked: the list just isn't kept */
  }
  return list;
}

/** Puts `q` first (once, whatever its case), keeping the newest RECENT_SEARCHES_MAX. */
export function addRecentSearch(market: Market, q: string): string[] {
  const clean = cleanSearch(q);
  const list = readRecentSearches(market);
  if (!clean) return list;
  return write(market, [clean, ...list.filter((x) => !same(x, clean))].slice(0, RECENT_SEARCHES_MAX));
}

export function removeRecentSearch(market: Market, q: string): string[] {
  return write(market, readRecentSearches(market).filter((x) => !same(x, q)));
}

/** The recent searches that start with what's typed (not the same search again), at most `n`. */
export function matchingRecentSearches(list: readonly string[], typed: string, n: number): string[] {
  const t = cleanSearch(typed).toLowerCase();
  if (!t) return list.slice(0, n);
  return list.filter((x) => x.toLowerCase().startsWith(t) && x.toLowerCase() !== t).slice(0, n);
}
