import type { Db } from '../db/client';
import type { Market, Order } from '../types';
import { DataError, unwrap } from './errors';

/** A shopper's rating of one seller in one of their orders. */
export interface SellerFeedback {
  orderId: string;
  seller: string;
  /** 1–5 stars */
  rating: number;
  arrivedOnTime: boolean | null;
  asDescribed: boolean | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A seller's ratings in a store over the last 12 months. */
export interface SellerRating {
  ratings: number;
  /** average stars, one decimal */
  average: number;
  /** share of 4 and 5 star ratings, 0–100 */
  positivePct: number;
}

export const FEEDBACK_DAYS = 90;
export const FEEDBACK_COMMENT_MAX = 500;
const DAY_MS = 86_400_000;

/** The sellers in an order, in the order their items appear. */
export function orderSellers(order: Pick<Order, 'items'>): string[] {
  return [...new Set(order.items.map((i) => i.seller))];
}

/** Until when the order's sellers can be rated: 90 days after it arrived. Null before it arrives. */
export function feedbackOpenUntil(order: Pick<Order, 'status' | 'deliveredAt'>, now: Date): Date | null {
  if (order.status !== 'placed' || !order.deliveredAt) return null;
  const delivered = Date.parse(order.deliveredAt);
  if (!(delivered <= now.getTime())) return null;
  return new Date(delivered + FEEDBACK_DAYS * DAY_MS);
}

export function feedbackOpen(order: Pick<Order, 'status' | 'deliveredAt'>, now: Date): boolean {
  const until = feedbackOpenUntil(order, now);
  return until !== null && now.getTime() <= until.getTime();
}

/** "4.6 out of 5 · 92% positive (25 ratings)" */
export function ratingText(r: SellerRating): string {
  return `${r.average.toFixed(1)} out of 5 · ${r.positivePct}% positive (${r.ratings} ${r.ratings === 1 ? 'rating' : 'ratings'})`;
}

const yesNo = (v: unknown): boolean | null => (v === true || v === 'yes' ? true : v === false || v === 'no' ? false : null);

/** Check and tidy what the shopper sent. */
export function parseFeedback(input: { rating: unknown; arrivedOnTime?: unknown; asDescribed?: unknown; comment?: unknown }) {
  const rating = typeof input.rating === 'string' && input.rating.trim() !== '' ? Number(input.rating) : input.rating;
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new DataError('invalid_input', 'rating', 'Choose a rating from 1 to 5 stars.');
  }
  if (input.comment != null && typeof input.comment !== 'string') throw new DataError('invalid_input', 'comment');
  const comment = (input.comment ?? '').replace(/\r\n?/g, '\n').trim();
  if (comment.length > FEEDBACK_COMMENT_MAX) {
    throw new DataError('invalid_input', 'comment', `Keep your comment under ${FEEDBACK_COMMENT_MAX} characters.`);
  }
  return { rating, arrivedOnTime: yesNo(input.arrivedOnTime), asDescribed: yesNo(input.asDescribed), comment: comment || null };
}

type Row = {
  order_id: string;
  seller: string;
  rating: number;
  arrived_on_time: boolean | null;
  as_described: boolean | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

function toFeedback(r: Row): SellerFeedback {
  return {
    orderId: r.order_id,
    seller: r.seller,
    rating: r.rating,
    arrivedOnTime: r.arrived_on_time,
    asDescribed: r.as_described,
    comment: r.comment,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const COLS = 'order_id, seller, rating, arrived_on_time, as_described, comment, created_at, updated_at';

/** The caller's feedback on an order's sellers, by seller. */
export async function orderFeedback(db: Db, orderId: string): Promise<Map<string, SellerFeedback>> {
  const rows = unwrap(await db.from('seller_feedback').select(COLS).eq('order_id', orderId));
  return new Map(rows.map((r) => [r.seller, toFeedback(r)]));
}

/** All of a shopper's seller feedback, newest first. */
export async function myFeedback(db: Db, userId: string): Promise<SellerFeedback[]> {
  const rows = unwrap(await db.from('seller_feedback').select(COLS).eq('user_id', userId).order('created_at', { ascending: false }));
  return rows.map(toFeedback);
}

/** Rate a seller in one of the caller's delivered orders, or change the rating. */
export async function leaveSellerFeedback(
  db: Db,
  orderId: string,
  seller: string,
  input: { rating: unknown; arrivedOnTime?: unknown; asDescribed?: unknown; comment?: unknown },
): Promise<SellerFeedback> {
  const f = parseFeedback(input);
  const row = unwrap(
    await db.rpc('leave_seller_feedback', {
      p_order_id: orderId,
      p_seller: seller,
      p_rating: f.rating,
      ...(f.arrivedOnTime === null ? {} : { p_on_time: f.arrivedOnTime }),
      ...(f.asDescribed === null ? {} : { p_as_described: f.asDescribed }),
      ...(f.comment === null ? {} : { p_comment: f.comment }),
    }),
  ) as Row;
  return toFeedback(row);
}

/** Remove the caller's feedback for a seller in an order. */
export async function removeSellerFeedback(db: Db, orderId: string, seller: string): Promise<void> {
  const removed = unwrap(await db.from('seller_feedback').delete().eq('order_id', orderId).eq('seller', seller).select('order_id'));
  if (!removed.length) throw new DataError('not_found', 'feedback', 'There’s no feedback for that seller on this order.');
}

/** Sellers' ratings in a store (last 12 months), by seller; sellers without any are left out. */
export async function sellerRatings(db: Db, market: Market, sellers: string[]): Promise<Map<string, SellerRating>> {
  if (!sellers.length) return new Map();
  const rows = unwrap(await db.rpc('seller_ratings', { p_market: market, p_sellers: sellers }));
  return new Map(
    rows.map((r) => [
      r.seller,
      { ratings: r.ratings, average: Number(r.average), positivePct: r.ratings ? Math.round((r.positive / r.ratings) * 100) : 0 },
    ]),
  );
}
