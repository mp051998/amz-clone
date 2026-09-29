import 'server-only';
import type { Db } from '../db/client';
import type { Market } from '../types';
import { DataError, unwrap } from './errors';

/**
 * Review moderation for store admins (/admin/reviews, /api/v1/admin/reviews). Three open reports
 * hide a review on their own; admins then keep it (visible again, those reports resolved), hide
 * it, or delete it. Both RPCs check public.is_admin() (20261003090000_review_moderation.sql).
 */

export type ReviewQueueView = 'reported' | 'hidden';
export type ModerationAction = 'keep' | 'hide' | 'delete';
export type HiddenReason = 'reports' | 'admin';

export const REVIEW_QUEUE_VIEWS: readonly ReviewQueueView[] = ['reported', 'hidden'];
export const MODERATION_ACTIONS: readonly ModerationAction[] = ['keep', 'hide', 'delete'];
export const REVIEW_QUEUE_PAGE_SIZE = 25;

export function queueView(v: unknown): ReviewQueueView {
  return (REVIEW_QUEUE_VIEWS as readonly unknown[]).includes(v) ? (v as ReviewQueueView) : 'reported';
}

export function isModerationAction(v: unknown): v is ModerationAction {
  return (MODERATION_ACTIONS as readonly unknown[]).includes(v);
}

export interface QueuedReview {
  id: string;
  productId: string;
  productTitle: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  verified: boolean;
  seeded: boolean;
  helpful: number;
  createdAt: string;
  hiddenAt?: string;
  hiddenReason?: HiddenReason;
  moderatedAt?: string;
  /** reports filed since the last admin decision */
  openReports: number;
  lastReportedAt?: string;
  /** open reports by reason, e.g. { spam: 2, offensive: 1 } */
  reasons: Record<string, number>;
}

export interface ReviewQueuePage {
  reviews: QueuedReview[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<ReviewQueueView, number>;
}

export interface ModerationResult {
  id: string;
  deleted: boolean;
  hiddenAt?: string;
  hiddenReason?: HiddenReason;
  moderatedAt?: string;
}

type Row = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

function toQueued(r: Row): QueuedReview {
  return {
    id: String(r.id),
    productId: String(r.product_id),
    productTitle: String(r.product_title ?? ''),
    author: String(r.author_name ?? ''),
    rating: Number(r.rating ?? 0),
    title: String(r.title ?? ''),
    body: String(r.body ?? ''),
    verified: r.verified === true,
    seeded: r.seeded === true,
    helpful: Number(r.helpful_count ?? 0),
    createdAt: String(r.created_at),
    hiddenAt: str(r.hidden_at),
    hiddenReason: str(r.hidden_reason) as HiddenReason | undefined,
    moderatedAt: str(r.moderated_at),
    openReports: Number(r.open_reports ?? 0),
    lastReportedAt: str(r.last_reported_at),
    reasons: Object.fromEntries(Object.entries((r.reasons ?? {}) as Row).map(([k, n]) => [k, Number(n)])),
  };
}

/** One page of a store's reported (open reports) or hidden reviews, with both views' counts. */
export async function listReviewQueue(
  db: Db,
  market: Market,
  opts: { view?: ReviewQueueView; page?: number } = {},
): Promise<ReviewQueuePage> {
  const json = unwrap(
    await db.rpc('admin_review_queue', {
      p_market: market,
      p_view: opts.view ?? 'reported',
      p_page: Math.max(1, Math.floor(opts.page ?? 1)),
      p_page_size: REVIEW_QUEUE_PAGE_SIZE,
    }),
  ) as Row;
  const counts = (json.counts ?? {}) as Record<string, number>;
  return {
    reviews: ((json.reviews ?? []) as Row[]).map(toQueued),
    total: Number(json.total ?? 0),
    page: Number(json.page ?? 1),
    pageSize: Number(json.page_size ?? REVIEW_QUEUE_PAGE_SIZE),
    counts: { reported: Number(counts.reported ?? 0), hidden: Number(counts.hidden ?? 0) },
  };
}

/** Whether a review belongs to a product of `market` (the admin API scopes by store). */
export async function assertStoreReview(db: Db, market: Market, id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DataError('review_not_found');
  const row = unwrap(
    await db.from('reviews').select('id, products!inner(market_id)').eq('id', id).eq('products.market_id', market).maybeSingle(),
  );
  if (!row) throw new DataError('review_not_found');
}

/** keep: visible again, reports so far resolved. hide: hidden by an admin. delete: gone. */
export async function moderateReview(db: Db, id: string, action: ModerationAction): Promise<ModerationResult> {
  const r = unwrap(await db.rpc('admin_moderate_review', { p_review_id: id, p_action: action })) as Row;
  return {
    id: String(r.id),
    deleted: r.deleted === true,
    hiddenAt: str(r.hidden_at),
    hiddenReason: str(r.hidden_reason) as HiddenReason | undefined,
    moderatedAt: str(r.moderated_at),
  };
}
