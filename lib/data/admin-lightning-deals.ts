import type { Db } from '../db/client';
import type { Database } from '../db/database.types';
import { localDateTime } from '../decision/tracking';
import type { Market } from '../types';
import { toMinor } from './admin-catalog';
import { DataError, unwrap } from './errors';

/**
 * Lightning Deals for store admins (/admin/deals, /api/v1/admin/lightning-deals): a store's live,
 * upcoming and past deals with their products, and scheduling or calling one off. The store plans
 * deals by itself too; schedule_lightning_deal and cancel_lightning_deal are for admins only
 * (20261224090000_admin_lightning_deals.sql).
 */

export type DealView = 'live' | 'upcoming' | 'ended';

export const DEAL_VIEWS: readonly DealView[] = ['live', 'upcoming', 'ended'];

export function dealView(v: unknown): DealView {
  return (DEAL_VIEWS as readonly unknown[]).includes(v) ? (v as DealView) : 'live';
}

/** The longest a deal runs, in hours. */
export const DEAL_HOURS_MAX = 12;
/** How long the form's deals run unless the admin picks otherwise. */
export const DEAL_HOURS_DEFAULT = 6;
/** The ended view shows the latest this many. */
export const ENDED_LIMIT = 50;

export type DealEndReason = 'time' | 'sold_out' | 'repriced' | 'unavailable' | 'cancelled';

export interface AdminLightningDeal {
  id: string;
  productId: string;
  title: string;
  image: string;
  dealPriceMinor: number;
  /** the price before the deal: saved as it went live, the product's price now until then */
  wasPriceMinor: number | null;
  quota: number;
  claimed: number;
  startsAt: string;
  endsAt: string;
  startedAt: string | null;
  endedAt: string | null;
  endReason: DealEndReason | null;
  /** false when the store planned it itself */
  byAdmin: boolean;
}

export interface AdminDealList {
  view: DealView;
  deals: AdminLightningDeal[];
  /** open deals: live now, and not started yet */
  counts: { live: number; upcoming: number };
}

type DealRow = Database['public']['Tables']['lightning_deals']['Row'];
type ProductBits = { id: string; title: string; image: string; price_minor: number };

/** Deals with their products' titles, images and prices. */
async function withProducts(db: Db, rows: DealRow[]): Promise<AdminLightningDeal[]> {
  const ids = [...new Set(rows.map((r) => r.product_id))];
  const products = ids.length ? ((unwrap(await db.from('products').select('id, title, image, price_minor').in('id', ids)) ?? []) as ProductBits[]) : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  return rows.map((r) => {
    const p = byId.get(r.product_id);
    return {
      id: r.id,
      productId: r.product_id,
      title: p?.title ?? '',
      image: p?.image ?? '',
      dealPriceMinor: r.deal_price_minor,
      wasPriceMinor: r.was_price_minor ?? (r.started_at ? null : (p?.price_minor ?? null)),
      quota: r.quota,
      claimed: r.claimed,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      endReason: (r.end_reason as DealEndReason | null) ?? null,
      byAdmin: r.scheduled_by != null,
    };
  });
}

/**
 * A store's deals in one view: live (ending soonest first), upcoming (starting soonest first) or
 * ended (the latest 50), with how many are live and upcoming.
 */
export async function listAdminLightningDeals(db: Db, market: Market, view: DealView = 'live'): Promise<AdminDealList> {
  const base = () => db.from('lightning_deals').select('*').eq('market_id', market);
  const count = (started: boolean) => {
    const q = db.from('lightning_deals').select('id', { count: 'exact', head: true }).eq('market_id', market).is('ended_at', null);
    return started ? q.not('started_at', 'is', null) : q.is('started_at', null);
  };
  const list =
    view === 'live'
      ? base().is('ended_at', null).not('started_at', 'is', null).order('ends_at').order('id')
      : view === 'upcoming'
        ? base().is('ended_at', null).is('started_at', null).order('starts_at').order('id')
        : base().not('ended_at', 'is', null).order('ended_at', { ascending: false }).order('id').limit(ENDED_LIMIT);
  const [res, live, upcoming] = await Promise.all([list, count(true), count(false)]);
  return {
    view,
    deals: await withProducts(db, (unwrap(res) ?? []) as DealRow[]),
    counts: { live: live.count ?? 0, upcoming: upcoming.count ?? 0 },
  };
}

/** A product's deals that haven't ended, soonest first. */
export async function openDealsOf(db: Db, productId: string): Promise<AdminLightningDeal[]> {
  const res = await db.from('lightning_deals').select('*').eq('product_id', productId).is('ended_at', null).order('starts_at');
  return withProducts(db, (unwrap(res) ?? []) as DealRow[]);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One deal, if it's in `market`. */
export async function getAdminLightningDeal(db: Db, market: Market, id: string): Promise<AdminLightningDeal | null> {
  if (!UUID.test(id)) return null;
  const res = await db.from('lightning_deals').select('*').eq('id', id).eq('market_id', market).maybeSingle();
  const row = unwrap(res) as DealRow | null;
  return row ? (await withProducts(db, [row]))[0] : null;
}

export interface ScheduleDealInput {
  productId: string;
  dealPriceMinor: number;
  quota: number;
  /** null: now */
  startsAt: string | null;
  /** how long it runs, 1 to 12 */
  hours: number;
}

/** Schedule a deal (admins only); live at once when it starts now. Returns its id. */
export async function scheduleLightningDeal(db: Db, input: ScheduleDealInput): Promise<string> {
  const id = unwrap(
    await db.rpc('schedule_lightning_deal', {
      p_product: input.productId,
      p_deal_price_minor: input.dealPriceMinor,
      p_quota: input.quota,
      p_starts_at: input.startsAt,
      p_hours: input.hours,
    }),
  );
  return String(id);
}

/** Call a deal off (admins only): before it starts, or now while it's live (its price goes back). */
export async function cancelLightningDeal(db: Db, id: string): Promise<void> {
  if (!UUID.test(id)) throw new DataError('not_found');
  unwrap(await db.rpc('cancel_lightning_deal', { p_id: id }));
}

/** The deal form's fields, and what can be wrong with them. */
export type DealField = 'price' | 'quota' | 'starts' | 'hours';
export type DealProblem = DealField | 'overlap' | 'product';

/** What to tell the admin for each problem with a deal. */
export function dealProblemText(problem: string | undefined, { stock }: { stock?: number } = {}): string | null {
  switch (problem) {
    case 'price':
      return 'Enter a deal price below the product’s price.';
    case 'quota':
      return stock != null ? `Enter how many units are at the deal price: 1 to ${stock}, what’s in stock.` : 'Enter how many units are at the deal price, up to what’s in stock.';
    case 'starts':
      return 'Pick a start that hasn’t passed (after the product comes out, for a pre-order), or leave it blank to start now.';
    case 'hours':
      return `Pick how long it runs: 1 to ${DEAL_HOURS_MAX} hours.`;
    case 'overlap':
      return 'This product has another deal then. Pick a time that doesn’t overlap it, or cancel that one first.';
    case 'product':
      return 'This product can’t have a deal: it’s archived, or it’s another seller’s offer.';
    default:
      return null;
  }
}

/** Which problem a refusal from the database is. */
export function dealProblemOf(err: DataError): DealProblem | null {
  if (err.code !== 'invalid_input') return null;
  switch (err.detail) {
    case 'deal_price_minor':
      return 'price';
    case 'quota':
      return 'quota';
    case 'starts_at':
      return 'starts';
    case 'hours':
      return 'hours';
    case 'product_id':
      return 'product';
    case 'overlap':
      return 'overlap';
    default:
      return null;
  }
}

/**
 * The deal form (price in major units, units, an optional start as the store's local date and
 * time, and hours) → what to schedule, or the first problem with it.
 */
export function parseDealForm(
  form: { price: string; quota: string; starts: string; hours: string },
  product: { id: string; priceMinor: number; stock: number },
  { timeZone, now = new Date() }: { timeZone: string; now?: Date },
): { input: ScheduleDealInput; problem?: undefined } | { input?: undefined; problem: DealField } {
  const dealPriceMinor = toMinor(form.price);
  if (dealPriceMinor == null || dealPriceMinor < 1 || dealPriceMinor >= product.priceMinor) return { problem: 'price' };
  const quota = /^\d+$/.test(form.quota.trim()) ? Number(form.quota.trim()) : NaN;
  if (!(quota >= 1 && quota <= product.stock)) return { problem: 'quota' };
  const startsText = form.starts.trim();
  const startsAt = startsText ? localDateTime(startsText, timeZone) : null;
  if (startsText && (!startsAt || Date.parse(startsAt) < now.getTime() - 5 * 60_000)) return { problem: 'starts' };
  const hours = /^\d+$/.test(form.hours.trim()) ? Number(form.hours.trim()) : NaN;
  if (!(hours >= 1 && hours <= DEAL_HOURS_MAX)) return { problem: 'hours' };
  return { input: { productId: product.id, dealPriceMinor, quota, startsAt, hours } };
}
