import 'server-only';
import { cookies } from 'next/headers';

/**
 * Recently viewed products (read-only here). The product page writes the cookie:
 * name `recent:v1`, value = comma-separated product ids, newest first, max 12.
 */
export const RECENT_COOKIE = 'recent:v1';
export const RECENT_MAX = 12;

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Parse a `recent:v1` cookie value into unique, well-formed ids (newest first). */
export function parseRecent(raw: string | undefined | null): string[] {
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
    if (seen.size >= RECENT_MAX) break;
  }
  return [...seen];
}

/** Ids the viewer looked at recently (any store — filter by market after fetching). */
export async function readRecentIds(): Promise<string[]> {
  return parseRecent((await cookies()).get(RECENT_COOKIE)?.value);
}
