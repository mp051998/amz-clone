/** "Search customer reviews": 2–100 characters, matched anywhere in a review's headline or text. */
export const REVIEW_SEARCH_MIN = 2;
export const REVIEW_SEARCH_MAX = 100;

/** A review search as typed, tidied: trimmed, inner spaces collapsed; null when too short to search. */
export function readReviewSearch(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const q = v.replace(/\s+/g, ' ').trim().slice(0, REVIEW_SEARCH_MAX);
  return q.length >= REVIEW_SEARCH_MIN ? q : null;
}
