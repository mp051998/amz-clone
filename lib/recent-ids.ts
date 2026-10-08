/**
 * The browsing history cookie, shared by the product page (writes it from the browser), the
 * home page and /history (read it) and the history actions (edit it).
 *
 * `recent:v1` holds product ids, newest first, comma-separated, across both stores (pages filter
 * by store after fetching). `recent:off` = "1" pauses it: views aren't added, the list stays.
 */
export const RECENT_COOKIE = 'recent:v1';
export const RECENT_PAUSED_COOKIE = 'recent:off';
export const RECENT_MAX = 30;
/** 30 days, renewed on every change */
export const RECENT_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * "Don't use for recommendations": `recs:skip` holds the products, viewed or bought, the viewer
 * asked not to base recommendations on, in the same format (newest first), kept for a year.
 */
export const RECS_SKIP_COOKIE = 'recs:skip';
export const RECS_SKIP_MAX = 100;
export const RECS_SKIP_MAX_AGE = 60 * 60 * 24 * 365;

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Parse a `recent:v1` value into unique, well-formed ids (newest first). */
export function parseRecent(raw: string | undefined | null): string[] {
  return parseIds(raw, RECENT_MAX);
}

/** Parse a comma-separated cookie value into up to `max` unique, well-formed ids, in order. */
export function parseIds(raw: string | undefined | null, max: number): string[] {
  if (!raw) return [];
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  const seen = new Set<string>();
  for (const part of value.split(',')) {
    const id = part.trim();
    if (ID.test(id) && !seen.has(id)) seen.add(id);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** Next list after viewing `id`: newest first, deduped, capped at RECENT_MAX. */
export function nextRecent(current: string | null | undefined, id: string): string[] {
  return [id, ...parseRecent(current).filter((x) => x !== id)].slice(0, RECENT_MAX);
}
