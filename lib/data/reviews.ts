import type { Db } from '../db/client';
import type { Market, Product, Review } from '../types';
import { getProducts } from './catalog';
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

/** "Top reviews" (most helpful first, then newest) or "Most recent". */
export type ReviewSort = 'top' | 'recent';

export function readReviewSort(v: unknown): ReviewSort {
  return v === 'recent' ? 'recent' : 'top';
}

/** Which written reviews to list: one star, `positive` (4–5★) or `critical` (1–3★); verified purchases only. */
export type ReviewStars = 1 | 2 | 3 | 4 | 5 | 'positive' | 'critical';

export interface ReviewFilter {
  stars?: ReviewStars;
  verified?: boolean;
}

/** `?stars=` (1–5, positive, critical) and `?verified=` (1 / true) into a filter; anything else is ignored. */
export function readReviewFilter(stars: unknown, verified: unknown): ReviewFilter {
  const out: ReviewFilter = {};
  const s = typeof stars === 'string' ? stars.trim().toLowerCase() : stars;
  if (s === 'positive' || s === 'critical') out.stars = s;
  else if (typeof s === 'number' || typeof s === 'string') {
    const n = Number(s);
    if (Number.isInteger(n) && n >= 1 && n <= 5) out.stars = n as ReviewStars;
  }
  if (verified === true || verified === '1' || verified === 'true') out.verified = true;
  return out;
}

const starRange = (stars: ReviewStars): [number, number] =>
  stars === 'positive' ? [4, 5] : stars === 'critical' ? [1, 3] : [stars, stars];

/** Whether a review passes a filter. */
export function matchesReviewFilter(r: { rating: number; verified: boolean }, f: ReviewFilter): boolean {
  if (f.verified && !r.verified) return false;
  if (!f.stars) return true;
  const [lo, hi] = starRange(f.stars);
  return r.rating >= lo && r.rating <= hi;
}

/**
 * How many written, visible reviews a product has per star, all and verified only, so filter
 * chips can show exact counts without loading every review (see `facetCount` in
 * components/product/reviewFilters.ts).
 */
export type ReviewFacets = Record<1 | 2 | 3 | 4 | 5, { all: number; verified: number }>;

export function emptyReviewFacets(): ReviewFacets {
  return { 1: { all: 0, verified: 0 }, 2: { all: 0, verified: 0 }, 3: { all: 0, verified: 0 }, 4: { all: 0, verified: 0 }, 5: { all: 0, verified: 0 } };
}

/** A product's review facets (hidden reviews left out, as in the listing). */
export async function reviewFacets(db: Db, productId: string): Promise<ReviewFacets> {
  const read = (moderated: boolean) => {
    const q = db.from('reviews').select('rating, verified').eq('product_id', productId);
    return (moderated ? q.is('hidden_at', null) : q).range(0, 9999);
  };
  let res = await read(true);
  if (res.error?.code === MISSING_COLUMN) res = await read(false);
  const facets = emptyReviewFacets();
  for (const r of (unwrap(res) ?? []) as { rating: number; verified: boolean }[]) {
    const bucket = facets[r.rating as 1 | 2 | 3 | 4 | 5];
    if (!bucket) continue;
    bucket.all += 1;
    if (r.verified) bucket.verified += 1;
  }
  return facets;
}

export interface ReviewPage {
  items: Review[];
  total: number;
  /** the viewer's own review of this product, if any (also pinned first in items) */
  mine: Review | null;
}

/**
 * A product's reviews: most helpful first, then newest (`top`), or newest first
 * (`recent`), optionally only some stars and/or verified purchases (`total` counts
 * the filtered set). The viewer's own review is pinned to the top when it passes the
 * filter, and each item says whether the viewer already voted it helpful / reported it.
 */
export async function listReviews(
  db: Db,
  productId: string,
  viewerId: string | null,
  opts: { limit?: number; offset?: number; sort?: ReviewSort; filter?: ReviewFilter } = {},
): Promise<ReviewPage> {
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const offset = Math.max(opts.offset ?? 0, 0);
  const filter = opts.filter ?? {};
  // hidden reviews stay out of the listing for everyone (admins included: they use the queue);
  // the author still gets their own below, marked hidden
  const page = (moderated: boolean) => {
    const q = db
      .from('reviews')
      .select(moderated ? REVIEW_COLS : LEGACY_COLS, { count: 'exact' })
      .eq('product_id', productId);
    let visible = moderated ? q.is('hidden_at', null) : q;
    if (filter.stars) {
      const [lo, hi] = starRange(filter.stars);
      visible = lo === hi ? visible.eq('rating', lo) : visible.gte('rating', lo).lte('rating', hi);
    }
    if (filter.verified) visible = visible.eq('verified', true);
    const ordered = opts.sort === 'recent' ? visible : visible.order('helpful_count', { ascending: false });
    return ordered
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
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

  // the viewer's own review is pinned to page one (when it passes the filter) and skipped at its natural spot
  const pinned = own && matchesReviewFilter(own, filter) ? own : null;
  const rest = rows.filter((r) => r.id !== pinned?.id);
  const ordered = pinned && offset === 0 ? [pinned, ...rest] : rest;
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

/** One of the caller's reviews, with the product it's about (Your reviews). */
export interface MyReview {
  review: Review;
  product: Product;
}

/** The caller's reviews of products in this store, newest first. Hidden ones are included, marked. */
export async function listMyReviews(db: Db, market: Market, userId: string): Promise<MyReview[]> {
  const rows = unwrap(
    await db
      .from('reviews')
      .select(`${REVIEW_COLS}, product_id, products!inner(market_id)`)
      .eq('user_id', userId)
      .eq('products.market_id', market)
      .order('created_at', { ascending: false })
      .limit(100),
  ) as unknown as (ReviewRow & { product_id: string })[];
  const byId = new Map((await getProducts(db, rows.map((r) => r.product_id), { includeArchived: true })).map((p) => [p.id, p]));
  return rows.flatMap((r) => {
    const product = byId.get(r.product_id);
    return product ? [{ review: toReview(r, userId, new Set(), new Set()), product }] : [];
  });
}

/** A product the caller has received and not reviewed yet. */
export interface ToReview {
  product: Product;
  orderId: string;
  deliveredAt: string;
}

/**
 * Products from the caller's delivered orders in this store that they haven't reviewed, most
 * recently delivered first, each once. Products no longer on sale are left out.
 */
export async function awaitingReview(db: Db, market: Market, userId: string, now = new Date()): Promise<ToReview[]> {
  const [orders, reviewed] = await Promise.all([
    db
      .from('orders')
      .select('id, delivered_at, order_items(product_id)')
      .eq('user_id', userId)
      .eq('market_id', market)
      .eq('status', 'placed')
      .lte('delivered_at', now.toISOString())
      .order('delivered_at', { ascending: false })
      .limit(100),
    db.from('reviews').select('product_id').eq('user_id', userId),
  ]);
  const done = new Set(unwrap(reviewed).map((r) => r.product_id));
  const first = new Map<string, { orderId: string; deliveredAt: string }>();
  for (const o of unwrap(orders)) {
    for (const it of o.order_items ?? []) {
      if (it.product_id && o.delivered_at && !done.has(it.product_id) && !first.has(it.product_id)) {
        first.set(it.product_id, { orderId: o.id, deliveredAt: o.delivered_at });
      }
    }
  }
  const byId = new Map((await getProducts(db, [...first.keys()])).map((p) => [p.id, p]));
  return [...first].flatMap(([id, at]) => {
    const product = byId.get(id);
    return product ? [{ product, ...at }] : [];
  });
}

/** Which of these products the caller has reviewed (the order page's "Edit your review"). */
export async function reviewedProductIds(db: Db, userId: string, productIds: string[]): Promise<Set<string>> {
  if (!productIds.length) return new Set();
  const rows = unwrap(await db.from('reviews').select('product_id').eq('user_id', userId).in('product_id', productIds));
  return new Set(rows.map((r) => r.product_id));
}
