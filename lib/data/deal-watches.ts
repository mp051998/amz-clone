import type { Db } from '../db/client';
import { DataError, unwrap } from './errors';

/**
 * "Watch this deal": a signed-in shopper watches upcoming Lightning Deals, and each one that goes
 * live shows in their messages (`deal_live`, lib/data/inbox.ts). See
 * 20261225090000_lightning_deal_watches.sql.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Which of these deals the caller watches; none when signed out (or on a failed read: watching only decorates). */
export async function watchedDeals(db: Db, dealIds: string[]): Promise<Set<string>> {
  if (!dealIds.length) return new Set();
  const { data, error } = await db.from('lightning_deal_watches').select('deal_id').in('deal_id', dealIds);
  return error ? new Set() : new Set((data ?? []).map((r) => r.deal_id));
}

/** Watch a deal that hasn't started (`deal_not_upcoming` otherwise), or stop. Returns whether the caller watches it now. */
export async function watchDeal(db: Db, dealId: string, watch = true): Promise<boolean> {
  if (!UUID.test(dealId)) throw new DataError('not_found');
  return Boolean(unwrap(await db.rpc('watch_lightning_deal', { p_deal: dealId, p_watch: watch })));
}
