import 'server-only';
import { cookies } from 'next/headers';
import { parseRecent, RECENT_COOKIE, RECENT_PAUSED_COOKIE } from './recent-ids';

export { parseRecent, RECENT_COOKIE, RECENT_MAX } from './recent-ids';

/** Ids the viewer looked at recently (any store — filter by market after fetching). */
export async function readRecentIds(): Promise<string[]> {
  return parseRecent((await cookies()).get(RECENT_COOKIE)?.value);
}

/** Whether the viewer paused their browsing history. */
export async function historyPaused(): Promise<boolean> {
  return (await cookies()).get(RECENT_PAUSED_COOKIE)?.value === '1';
}
