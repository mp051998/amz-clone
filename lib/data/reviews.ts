import type { Db } from '../db/client';
import type { Market, Product, Review } from '../types';
import { isReviewFeature, readFeatureStars, type FeatureStars } from '../review-features';
import { isReviewFit, type FitCounts } from '../review-fit';
import { REVIEW_PHOTO_MAX, reviewPhoto } from '../review-photos';
import { readReviewSearch } from '../review-search';
import { getProducts } from './catalog';
import { DataError, unwrap } from './errors';
import { containsPattern } from './questions';
import { removeReviewPhotos } from './review-photos';

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
  vine?: boolean;
  helpful_count: number;
  created_at: string;
  hidden_at?: string | null;
  photos?: string[];
  fit?: string | null;
  features?: unknown;
}

function toReview(row: ReviewRow, viewerId: string | null, voted: Set<string>, reported: Set<string>): Review {
  return {
    id: row.id,
    author: row.author_name,
    ...(row.user_id ? { authorId: row.user_id } : {}),
    initial: row.author_name.trim().charAt(0).toUpperCase() || '?',
    rating: row.rating,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    verified: row.verified,
    ...(row.vine ? { vine: true } : {}),
    helpful: row.helpful_count,
    mine: viewerId != null && row.user_id === viewerId,
    votedHelpful: voted.has(row.id),
    reported: reported.has(row.id),
    ...(row.hidden_at ? { hidden: true } : {}),
    photos: (row.photos ?? []).map(reviewPhoto),
    ...(isReviewFit(row.fit) ? { fit: row.fit } : {}),
    ...withFeatures(readFeatureStars(row.features)),
  };
}

function withFeatures(features: FeatureStars): { features?: FeatureStars } {
  return Object.keys(features).length ? { features } : {};
}

const REVIEW_COLS = 'id, user_id, author_name, rating, title, body, verified, vine, helpful_count, created_at, hidden_at, photos, fit, features';
// until the moderation migration lands (a deploy can go out first): no hidden_at yet
const LEGACY_COLS = 'id, user_id, author_name, rating, title, body, verified, helpful_count, created_at';
const MISSING_COLUMN = '42703';

/** "Top reviews" (most helpful first, then newest) or "Most recent". */
export type ReviewSort = 'top' | 'recent';

export function readReviewSort(v: unknown): ReviewSort {
  return v === 'recent' ? 'recent' : 'top';
}

/** Which written reviews to list: one star, `positive` (4–5★) or `critical` (1–3★); verified purchases only; with photos only. */
export type ReviewStars = 1 | 2 | 3 | 4 | 5 | 'positive' | 'critical';

export interface ReviewFilter {
  stars?: ReviewStars;
  verified?: boolean;
  photos?: boolean;
  /** words the headline or review contains (2–100 characters) */
  q?: string;
}

const on = (v: unknown) => v === true || v === '1' || v === 'true';

/** `?stars=` (1–5, positive, critical), `?verified=` and `?photos=` (1 / true) and `?q=` into a filter; anything else is ignored. */
export function readReviewFilter(stars: unknown, verified: unknown, photos?: unknown, q?: unknown): ReviewFilter {
  const out: ReviewFilter = {};
  const s = typeof stars === 'string' ? stars.trim().toLowerCase() : stars;
  if (s === 'positive' || s === 'critical') out.stars = s;
  else if (typeof s === 'number' || typeof s === 'string') {
    const n = Number(s);
    if (Number.isInteger(n) && n >= 1 && n <= 5) out.stars = n as ReviewStars;
  }
  if (on(verified)) out.verified = true;
  if (on(photos)) out.photos = true;
  const search = readReviewSearch(q);
  if (search) out.q = search;
  return out;
}

const starRange = (stars: ReviewStars): [number, number] =>
  stars === 'positive' ? [4, 5] : stars === 'critical' ? [1, 3] : [stars, stars];

/** Whether a review passes a filter. */
export function matchesReviewFilter(
  r: { rating: number; verified: boolean; photos?: unknown[]; title?: string; body?: string },
  f: ReviewFilter,
): boolean {
  if (f.verified && !r.verified) return false;
  if (f.photos && !r.photos?.length) return false;
  if (f.q && !`${r.title ?? ''}\n${r.body ?? ''}`.toLowerCase().includes(f.q.toLowerCase())) return false;
  if (!f.stars) return true;
  const [lo, hi] = starRange(f.stars);
  return r.rating >= lo && r.rating <= hi;
}

/**
 * How many written, visible reviews a product has per star: all, verified only, with photos, and
 * verified with photos, so filter chips can show exact counts without loading every review (see
 * `facetCount` in components/product/reviewFilters.ts).
 */
export type ReviewFacet = { all: number; verified: number; photos?: number; verifiedPhotos?: number };
export type ReviewFacets = Record<1 | 2 | 3 | 4 | 5, ReviewFacet>;

export function emptyReviewFacets(): ReviewFacets {
  const zero = (): ReviewFacet => ({ all: 0, verified: 0, photos: 0, verifiedPhotos: 0 });
  return { 1: zero(), 2: zero(), 3: zero(), 4: zero(), 5: zero() };
}

/** Every visible written review's stars and words, for counting which themes reviews mention (lib/review-themes.ts). */
export async function reviewWords(db: Db, productId: string): Promise<{ rating: number; title: string; body: string }[]> {
  const res = await db.from('reviews').select('rating, title, body').eq('product_id', productId).is('hidden_at', null).range(0, 9999);
  return (unwrap(res) ?? []) as unknown as { rating: number; title: string; body: string }[];
}

/** A product's review facets (hidden reviews left out, as in the listing). */
export async function reviewFacets(db: Db, productId: string): Promise<ReviewFacets> {
  const read = (moderated: boolean) => {
    const q = db.from('reviews').select(moderated ? 'rating, verified, photos' : 'rating, verified').eq('product_id', productId);
    return (moderated ? q.is('hidden_at', null) : q).range(0, 9999);
  };
  let res = await read(true);
  if (res.error?.code === MISSING_COLUMN) res = await read(false);
  const facets = emptyReviewFacets();
  for (const r of (unwrap(res) ?? []) as unknown as { rating: number; verified: boolean; photos?: string[] }[]) {
    const bucket = facets[r.rating as 1 | 2 | 3 | 4 | 5];
    if (!bucket) continue;
    const photos = Boolean(r.photos?.length);
    bucket.all += 1;
    if (r.verified) bucket.verified += 1;
    if (photos) bucket.photos = (bucket.photos ?? 0) + 1;
    if (photos && r.verified) bucket.verifiedPhotos = (bucket.verifiedPhotos ?? 0) + 1;
  }
  return facets;
}

/**
 * How a product's visible reviews say it fits: how many answered runs small, true to size and
 * runs large. All zero before the fit migration, and on an error (the page goes on without it).
 */
export async function reviewFitCounts(db: Db, productId: string): Promise<FitCounts> {
  const counts: FitCounts = { small: 0, true_to_size: 0, large: 0 };
  const res = await db.from('reviews').select('fit').eq('product_id', productId).not('fit', 'is', null).is('hidden_at', null).range(0, 9999);
  if (res.error) return counts;
  for (const r of (res.data ?? []) as { fit: string | null }[]) if (isReviewFit(r.fit)) counts[r.fit] += 1;
  return counts;
}

/**
 * "By feature": each feature rated on a product's visible reviews, with its average and how many
 * rated it. Empty before the migration, and on an error (the page goes on without it).
 */
export async function reviewFeatureRows(db: Db, productId: string): Promise<{ feature: string; average: number; count: number }[]> {
  const res = await db.rpc('review_feature_ratings', { p_product_id: productId });
  if (res.error) return [];
  return (res.data ?? []).map((r) => ({ feature: r.feature, average: Number(r.average), count: r.ratings }));
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
    if (filter.photos && moderated) visible = visible.filter('photos', 'neq', '{}');
    if (filter.q) {
      const like = JSON.stringify(containsPattern(filter.q));
      visible = visible.or(`title.ilike.${like},body.ilike.${like}`);
    }
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
  /** photo paths from uploadReviewPhoto, in order; left out keeps the ones it has */
  photos?: unknown;
  /** clothing and shoes: small | true_to_size | large; null clears it, left out keeps it */
  fit?: unknown;
  /** "By feature": feature → 1–5 stars; null or {} clears them, left out keeps them */
  features?: unknown;
}

function parseFit(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (!isReviewFit(v)) throw new DataError('invalid_input', 'fit', 'Choose runs small, true to size or runs large.');
  return v;
}

function parseFeatures(v: unknown): FeatureStars | undefined {
  if (v === undefined) return undefined;
  if (v === null) return {};
  const bad = () => new DataError('invalid_input', 'features', 'Rate each feature from 1 to 5 stars.');
  if (typeof v !== 'object' || Array.isArray(v)) throw bad();
  const out: FeatureStars = {};
  for (const [k, n] of Object.entries(v)) {
    // a feature left unrated
    if (n === null || n === 0) continue;
    if (!isReviewFeature(k) || !Number.isInteger(n) || (n as number) < 1 || (n as number) > 5) throw bad();
    out[k] = n as number;
  }
  return out;
}

function parsePhotos(v: unknown, userId: string): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  const bad = () => new DataError('invalid_input', 'photos', `Add up to ${REVIEW_PHOTO_MAX} of your own photos.`);
  if (!Array.isArray(v) || v.length > REVIEW_PHOTO_MAX) throw bad();
  const paths = v.map((p) => (typeof p === 'string' ? p.trim() : ''));
  if (paths.some((p) => !p.startsWith(`${userId}/`)) || new Set(paths).size !== paths.length) throw bad();
  return paths;
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
  const photos = parsePhotos(input.photos, userId);
  const fit = parseFit(input.fit);
  const features = parseFeatures(input.features);
  const existing = unwrap(
    await db.from('reviews').select('id, photos').eq('product_id', productId).eq('user_id', userId).maybeSingle(),
  );
  const cols = REVIEW_COLS;
  const row = existing
    ? unwrap(
        await db
          .from('reviews')
          .update({
            rating: r.rating,
            title: r.title,
            body: r.body,
            ...(r.authorName ? { author_name: r.authorName } : {}),
            ...(photos ? { photos } : {}),
            ...(fit !== undefined ? { fit } : {}),
            ...(features !== undefined ? { features } : {}),
          })
          .eq('id', existing.id)
          .select(cols)
          .single(),
      )
    : unwrap(
        await db
          .from('reviews')
          // author_name is required by the table; the trigger fills the profile name when blank
          .insert({ product_id: productId, rating: r.rating, title: r.title, body: r.body, author_name: r.authorName || ' ', photos: photos ?? [], fit: fit ?? null, features: features ?? {} })
          .select(cols)
          .single(),
      );
  if (existing && photos) await removeReviewPhotos(db, existing.photos.filter((p) => !photos.includes(p)));
  return toReview(row as unknown as ReviewRow, userId, new Set(), new Set());
}

export async function deleteReview(db: Db, reviewId: string): Promise<void> {
  const deleted = unwrap(await db.from('reviews').delete().eq('id', reviewId).select('id, photos'));
  if (!deleted.length) throw new DataError('review_not_found');
  await removeReviewPhotos(db, deleted.flatMap((r) => r.photos));
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
      .select('id, delivered_at, order_items(product_id, offer_of)')
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
      // bought from another seller: the review is the product's
      const id = it.offer_of ?? it.product_id;
      if (id && o.delivered_at && !done.has(id) && !first.has(id)) {
        first.set(id, { orderId: o.id, deliveredAt: o.delivered_at });
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

/** How many of a reviewer's reviews a profile reads (newest first). */
export const PROFILE_REVIEW_MAX = 200;
export const PROFILE_PAGE_SIZE = 10;

export interface ReviewerProfile {
  /** the name on their newest review */
  name: string;
  initial: string;
  /** reviews shoppers can see, in this store */
  total: number;
  /** "helpful" votes over those reviews */
  helpful: number;
  /** a Vine Voice: one of those reviews is a Vine review */
  vine: boolean;
  page: number;
  pageCount: number;
  reviews: MyReview[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A reviewer's public profile, as Amazon's: the reviews they've written in this store that
 * shoppers can see (never hidden ones, even to the reviewer), newest first, and the helpful votes
 * they've had. null when there are none, so a profile says nothing about an account that hasn't
 * reviewed anything.
 */
export async function reviewerProfile(db: Db, market: Market, userId: string, page = 1): Promise<ReviewerProfile | null> {
  if (!UUID.test(userId)) return null;
  const rows = unwrap(
    await db
      .from('reviews')
      .select(`${REVIEW_COLS}, product_id, products!inner(market_id)`)
      .eq('user_id', userId)
      .eq('products.market_id', market)
      .is('hidden_at', null)
      .order('created_at', { ascending: false })
      .limit(PROFILE_REVIEW_MAX),
  ) as unknown as (ReviewRow & { product_id: string })[];
  if (!rows.length) return null;
  const pageCount = Math.max(1, Math.ceil(rows.length / PROFILE_PAGE_SIZE));
  const at = Math.min(pageCount, Math.max(1, Math.floor(page) || 1));
  const shown = rows.slice((at - 1) * PROFILE_PAGE_SIZE, at * PROFILE_PAGE_SIZE);
  const byId = new Map((await getProducts(db, shown.map((r) => r.product_id), { includeArchived: true })).map((p) => [p.id, p]));
  const name = rows[0].author_name;
  return {
    name,
    initial: name.trim().charAt(0).toUpperCase() || '?',
    total: rows.length,
    helpful: rows.reduce((n, r) => n + r.helpful_count, 0),
    vine: rows.some((r) => r.vine === true),
    page: at,
    pageCount,
    reviews: shown.flatMap((r) => {
      const product = byId.get(r.product_id);
      return product ? [{ review: toReview(r, null, new Set(), new Set()), product }] : [];
    }),
  };
}
