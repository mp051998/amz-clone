import type { Db } from '../db/client';
import type { Review } from '../types';
import { DataError, unwrap } from './errors';

export const REVIEW_REPORT_REASONS = ['spam', 'offensive', 'off_topic', 'other'] as const;
export type ReviewReportReason = (typeof REVIEW_REPORT_REASONS)[number];

interface ReviewRow {
  id: string;
  user_id: string | null;
  author_name: string;
  rating: number;
  title: string;
  body: string;
  verified: boolean;
  helpful_count: number;
  created_at: string;
  hidden_at?: string | null;
}

function toReview(row: ReviewRow, viewerId: string | null, voted: Set<string>, reported: Set<string>): Review {
  return {
    id: row.id,
    author: row.author_name,
    initial: row.author_name.trim().charAt(0).toUpperCase() || '?',
    rating: row.rating,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    verified: row.verified,
    helpful: row.helpful_count,
    mine: viewerId != null && row.user_id === viewerId,
    votedHelpful: voted.has(row.id),
    reported: reported.has(row.id),
    ...(row.hidden_at ? { hidden: true } : {}),
  };
}

const REVIEW_COLS = 'id, user_id, author_name, rating, title, body, verified, helpful_count, created_at, hidden_at';
// until the moderation migration lands (a deploy can go out first): no hidden_at yet
const LEGACY_COLS = 'id, user_id, author_name, rating, title, body, verified, helpful_count, created_at';
const MISSING_COLUMN = '42703';

export interface ReviewPage {
  items: Review[];
  total: number;
  /** the viewer's own review of this product, if any (also pinned first in items) */
  mine: Review | null;
}

/**
 * Top reviews for a product: most helpful first, then newest. The viewer's own
 * review is pinned to the top, and each item says whether the viewer already
 * voted it helpful / reported it.
 */
export async function listReviews(
  db: Db,
  productId: string,
  viewerId: string | null,
  opts: { limit?: number; offset?: number } = {},
): Promise<ReviewPage> {
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const offset = Math.max(opts.offset ?? 0, 0);
  // hidden reviews stay out of the listing for everyone (admins included: they use the queue);
  // the author still gets their own below, marked hidden
  const page = (moderated: boolean) => {
    const q = db
      .from('reviews')
      .select(moderated ? REVIEW_COLS : LEGACY_COLS, { count: 'exact' })
      .eq('product_id', productId);
    return (moderated ? q.is('hidden_at', null) : q)
      .order('helpful_count', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
  };
  let pageRes = await page(true);
  const moderated = pageRes.error?.code !== MISSING_COLUMN;
  if (!moderated) pageRes = await page(false);
  const cols = moderated ? REVIEW_COLS : LEGACY_COLS;
  const rows = unwrap(pageRes) as unknown as ReviewRow[];
  const total = pageRes.count ?? rows.length;

  let own: ReviewRow | null = null;
  const voted = new Set<string>();
  const reported = new Set<string>();
  if (viewerId) {
    own = (unwrap(
      await db.from('reviews').select(cols).eq('product_id', productId).eq('user_id', viewerId).maybeSingle(),
    ) as ReviewRow | null);
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const [votes, reports] = await Promise.all([
        db.from('review_votes').select('review_id').in('review_id', ids),
        db.from('review_reports').select('review_id').in('review_id', ids),
      ]);
      unwrap(votes).forEach((v) => voted.add(v.review_id));
      unwrap(reports).forEach((r) => reported.add(r.review_id));
    }
  }

  // the viewer's own review is pinned to page one and skipped at its natural spot
  const rest = rows.filter((r) => r.id !== own?.id);
  const ordered = own && offset === 0 ? [own, ...rest] : rest;
  const mine = own ? toReview(own, viewerId, voted, reported) : null;
  return { items: ordered.map((r) => toReview(r, viewerId, voted, reported)), total, mine };
}

export interface ReviewInput {
  rating?: unknown;
  title?: unknown;
  body?: unknown;
  authorName?: unknown;
}

function parseReview(input: ReviewInput) {
  const rating = Number(input.rating);
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  const authorName = typeof input.authorName === 'string' ? input.authorName.trim().slice(0, 60) : '';
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new DataError('invalid_input', 'rating', 'Please select a star rating.');
  if (!title) throw new DataError('invalid_input', 'title', 'Please add a headline.');
  if (title.length > 120) throw new DataError('invalid_input', 'title', 'Keep the headline under 120 characters.');
  if (!body) throw new DataError('invalid_input', 'body', 'Please write your review.');
  if (body.length > 4000) throw new DataError('invalid_input', 'body', 'Keep the review under 4,000 characters.');
  return { rating, title, body, authorName };
}

/**
 * Write (or rewrite) the caller's review of a product — one per customer. The
 * database decides the author, the "Verified Purchase" flag and the counters.
 */
export async function upsertReview(db: Db, productId: string, userId: string, input: ReviewInput): Promise<Review> {
  const r = parseReview(input);
  const existing = unwrap(
    await db.from('reviews').select('id').eq('product_id', productId).eq('user_id', userId).maybeSingle(),
  );
  const cols = LEGACY_COLS;
  const row = existing
    ? unwrap(
        await db
          .from('reviews')
          .update({ rating: r.rating, title: r.title, body: r.body, ...(r.authorName ? { author_name: r.authorName } : {}) })
          .eq('id', existing.id)
          .select(cols)
          .single(),
      )
    : unwrap(
        await db
          .from('reviews')
          // author_name is required by the table; the trigger fills the profile name when blank
          .insert({ product_id: productId, rating: r.rating, title: r.title, body: r.body, author_name: r.authorName || ' ' })
          .select(cols)
          .single(),
      );
  return toReview(row as ReviewRow, userId, new Set(), new Set());
}

export async function deleteReview(db: Db, reviewId: string): Promise<void> {
  const deleted = unwrap(await db.from('reviews').delete().eq('id', reviewId).select('id'));
  if (!deleted.length) throw new DataError('review_not_found');
}

export interface HelpfulState {
  reviewId: string;
  helpful: boolean;
  helpfulCount: number;
}

export async function toggleHelpful(db: Db, reviewId: string): Promise<HelpfulState> {
  const json = unwrap(await db.rpc('toggle_review_helpful', { p_review_id: reviewId })) as {
    review_id: string;
    helpful: boolean;
    helpful_count: number;
  };
  return { reviewId: json.review_id, helpful: json.helpful, helpfulCount: json.helpful_count };
}

/** File a report (idempotent: reporting twice is fine). */
export async function reportReview(db: Db, reviewId: string, reason: unknown = 'other'): Promise<void> {
  const r = (REVIEW_REPORT_REASONS as readonly string[]).includes(String(reason)) ? (reason as ReviewReportReason) : 'other';
  const res = await db.from('review_reports').upsert({ review_id: reviewId, reason: r }, { onConflict: 'review_id,user_id', ignoreDuplicates: true });
  if (res.error?.code === '23503') throw new DataError('review_not_found');
  unwrap(res);
}
