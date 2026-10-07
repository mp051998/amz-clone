import type { Db } from '../db/client';
import type { Market } from '../types';

/** How many related searches the results page shows. */
export const RELATED_SEARCHES = 8;

/**
 * Count a search that showed a first page of results. The database keeps it only when its words
 * find a product in the store, and never says who searched. Best effort: a failure is ignored,
 * since a missed count must never break search.
 */
export async function recordSearch(db: Db, market: Market, query: string): Promise<void> {
  const q = query.trim();
  if (q.length < 2) return;
  try {
    await db.rpc('record_search', { p_market: market, p_q: q.slice(0, 200) });
  } catch {
    // network trouble — skip this one
  }
}

/**
 * Other searches in the store that share a word with this one, most words in common first, then the
 * most searched. Empty when there are none, or when they can't be read (the row is just left out).
 */
export async function relatedSearches(db: Db, market: Market, query: string, limit = RELATED_SEARCHES): Promise<string[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await db.rpc('related_searches', { p_market: market, p_q: q.slice(0, 200), p_limit: limit }).then(
    (r) => r,
    () => null,
  );
  if (!res || res.error || !Array.isArray(res.data)) return [];
  const seen = new Set<string>();
  return res.data.filter((t): t is string => typeof t === 'string' && t.length > 0 && !seen.has(t) && !!seen.add(t)).slice(0, limit);
}
