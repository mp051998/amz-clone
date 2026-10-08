import 'server-only';
import { cookies } from 'next/headers';
import { parseIds, parseRecent, RECENT_COOKIE, RECENT_PAUSED_COOKIE, RECS_SKIP_COOKIE, RECS_SKIP_MAX } from './recent-ids';

export { parseRecent, RECENT_COOKIE, RECENT_MAX } from './recent-ids';

/** Ids the viewer looked at recently (any store — filter by market after fetching). */
export async function readRecentIds(): Promise<string[]> {
  return parseRecent((await cookies()).get(RECENT_COOKIE)?.value);
}

/** The products the viewer asked not to base recommendations on ("Don't use for recommendations"). */
export async function readRecsSkipped(): Promise<Set<string>> {
  return new Set(parseIds((await cookies()).get(RECS_SKIP_COOKIE)?.value, RECS_SKIP_MAX));
}

/** Whether the viewer paused their browsing history. */
export async function historyPaused(): Promise<boolean> {
  return (await cookies()).get(RECENT_PAUSED_COOKIE)?.value === '1';
}
