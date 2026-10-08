import type { Db } from '../db/client';
import type { Database } from '../db/database.types';
import { pickDeal } from '../lightning';
import type { LightningDeal, Market } from '../types';
import { toLightningDeal } from './map';

/**
 * Lightning Deals, read by anyone. The store plans, starts and ends them itself (pg_cron); these
 * only say what's on. They decorate pages, so a failed read is no deals rather than an error.
 */

type LightningDealRow = Database['public']['Tables']['lightning_deals']['Row'];

const HOUR = 3_600_000;

const rows = (data: unknown): LightningDeal[] =>
  ((data ?? []) as LightningDealRow[]).map(toLightningDeal).filter((d): d is LightningDeal => d != null);

/** Each product's deal now or next: live, sold out before its end, or upcoming. Products with none are left out. */
export async function lightningDealsFor(db: Db, productIds: string[], now: Date = new Date()): Promise<Map<string, LightningDeal>> {
  if (!productIds.length) return new Map();
  const { data, error } = await db
    .from('lightning_deals')
    .select('*')
    .in('product_id', productIds)
    .gt('ends_at', now.toISOString())
    .or('ended_at.is.null,end_reason.eq.sold_out');
  if (error) return new Map();
  const by = new Map<string, LightningDeal[]>();
  for (const d of rows(data)) by.set(d.productId, [...(by.get(d.productId) ?? []), d]);
  return new Map([...by].map(([id, deals]) => [id, pickDeal(deals)!]));
}

/** A store's live deals, soonest to end first, and those starting within `withinHours`, soonest first. */
export async function lightningDeals(
  db: Db,
  market: Market,
  { withinHours = 24, now = new Date() }: { withinHours?: number; now?: Date } = {},
): Promise<{ live: LightningDeal[]; upcoming: LightningDeal[] }> {
  const { data, error } = await db
    .from('lightning_deals')
    .select('*')
    .eq('market_id', market)
    .is('ended_at', null)
    .gt('ends_at', now.toISOString())
    .lt('starts_at', new Date(now.getTime() + withinHours * HOUR).toISOString())
    .order('starts_at');
  if (error) return { live: [], upcoming: [] };
  const all = rows(data);
  return {
    live: all.filter((d) => d.state === 'live').sort((a, b) => a.endsAt.localeCompare(b.endsAt)),
    upcoming: all.filter((d) => d.state === 'upcoming'),
  };
}
