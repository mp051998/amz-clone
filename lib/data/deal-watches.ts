import type { Db } from '../db/client';
import type { Database } from '../db/database.types';
import type { LightningDeal, Market } from '../types';
import { DataError, unwrap } from './errors';
import { toLightningDeal } from './map';

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

const ORDER: Record<LightningDeal['state'], number> = { live: 0, upcoming: 1, sold_out: 2 };

/**
 * "Watched deals": the caller's watched Lightning Deals in this store that haven't ended: live ones
 * first (ending soonest), then upcoming (starting soonest), then any all claimed before their end.
 * None signed out, or on a failed read.
 */
export async function myWatchedDeals(db: Db, market: Market, now: Date = new Date()): Promise<LightningDeal[]> {
  const watches = await db.from('lightning_deal_watches').select('deal_id');
  const ids = (watches.data ?? []).map((w) => w.deal_id);
  if (watches.error || !ids.length) return [];
  const { data, error } = await db
    .from('lightning_deals')
    .select('*')
    .in('id', ids)
    .eq('market_id', market)
    .gt('ends_at', now.toISOString())
    .or('ended_at.is.null,end_reason.eq.sold_out');
  if (error) return [];
  return ((data ?? []) as Database['public']['Tables']['lightning_deals']['Row'][])
    .map(toLightningDeal)
    .filter((d): d is LightningDeal => d != null)
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || (a.state === 'upcoming' ? a.startsAt.localeCompare(b.startsAt) : a.endsAt.localeCompare(b.endsAt)));
}
