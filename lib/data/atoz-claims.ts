import 'server-only';
import { CLAIM_DETAILS_MAX, CLAIM_DETAILS_MIN, CLAIM_NOTE_MAX, isClaimReason, type AtozClaim, type ClaimReason, type ClaimStatus } from '../atoz';
import type { Db } from '../db/client';
import type { Market, RefundStatus } from '../types';
import { DataError, unwrap } from './errors';
import { refundReturn } from './refunds';

/**
 * A-to-z Guarantee claims (see lib/atoz.ts). The database decides who can file one and when, and
 * prices the refund when an admin grants it; a card refund then goes to Stripe here, as for any
 * return (and an admin retries it under Returns › Refund issues if that fails).
 */

type Row = {
  id: string;
  order_id: string;
  market_id: string;
  seller: string;
  reason: string;
  details: string;
  status: string;
  decision_note: string | null;
  return_id: string | null;
  created_at: string;
  decided_at: string | null;
  withdrawn_at: string | null;
  refund?: { refund_minor: number; refund_status: string | null; refunded_at: string | null } | null;
};

export function toClaim(r: Row): AtozClaim {
  return {
    id: r.id,
    orderId: r.order_id,
    market: r.market_id as Market,
    seller: r.seller,
    reason: r.reason as ClaimReason,
    details: r.details,
    status: r.status as ClaimStatus,
    decisionNote: r.decision_note,
    returnId: r.return_id,
    refund: r.refund ? { amountMinor: r.refund.refund_minor, status: r.refund.refund_status as RefundStatus | null, refundedAt: r.refund.refunded_at } : null,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    withdrawnAt: r.withdrawn_at,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = 'id, order_id, market_id, seller, reason, details, status, decision_note, return_id, created_at, decided_at, withdrawn_at, refund:returns(refund_minor, refund_status, refunded_at)';

export interface ClaimInput {
  seller?: unknown;
  reason?: unknown;
  details?: unknown;
}

/** A claim's fields, checked: the seller, what went wrong, and what happened in 10–2,000 characters. */
export function parseClaim(input: ClaimInput): { seller: string; reason: ClaimReason; details: string } {
  const seller = typeof input.seller === 'string' ? input.seller.trim() : '';
  if (!seller) throw new DataError('invalid_input', 'seller', 'Choose the seller the claim is about.');
  if (!isClaimReason(input.reason)) throw new DataError('invalid_input', 'reason', 'Choose what went wrong.');
  const details = typeof input.details === 'string' ? input.details.trim() : '';
  if (details.length < CLAIM_DETAILS_MIN || details.length > CLAIM_DETAILS_MAX) {
    throw new DataError('invalid_input', 'details', 'Tell us what happened: at least 10 characters, up to 2,000.');
  }
  return { seller, reason: input.reason, details };
}

/** File a claim about one seller's items in the caller's order. */
export async function fileClaim(db: Db, orderId: string, input: ClaimInput): Promise<AtozClaim> {
  const c = parseClaim(input);
  const json = unwrap(await db.rpc('file_atoz_claim', { p_order_id: orderId, p_seller: c.seller, p_reason: c.reason, p_details: c.details }));
  return toClaim(json as unknown as Row);
}

/** Withdraw the caller's claim while it's under review. */
export async function withdrawClaim(db: Db, claimId: string): Promise<AtozClaim> {
  if (!UUID.test(claimId)) throw new DataError('claim_not_found');
  return toClaim(unwrap(await db.rpc('withdraw_atoz_claim', { p_claim_id: claimId })) as unknown as Row);
}

/** The claims about an order the caller can see (their own, or any as an admin), oldest first. */
export async function orderClaims(db: Db, orderId: string): Promise<AtozClaim[]> {
  const rows = unwrap(await db.from('atoz_claims').select(COLS).eq('order_id', orderId).order('created_at'));
  return (rows as unknown as Row[]).map(toClaim);
}

/** One claim the caller can see, or null. */
export async function getClaim(db: Db, claimId: string): Promise<AtozClaim | null> {
  if (!UUID.test(claimId)) return null;
  const row = unwrap(await db.from('atoz_claims').select(COLS).eq('id', claimId).maybeSingle());
  return row ? toClaim(row as unknown as Row) : null;
}

export type ClaimDecision = 'grant' | 'deny';

/**
 * An admin's decision: `grant` refunds what's left of the seller's items in the order (a card
 * refund goes to Stripe now), `deny` closes it with `note`, which the shopper sees. A grant can
 * carry a note too.
 */
export async function decideClaim(db: Db, claimId: string, decision: unknown, note?: unknown): Promise<AtozClaim> {
  if (!UUID.test(claimId)) throw new DataError('claim_not_found');
  if (decision !== 'grant' && decision !== 'deny') throw new DataError('invalid_input', 'decision', 'Grant or deny the claim.');
  const text = typeof note === 'string' ? note.trim() : '';
  if (text.length > CLAIM_NOTE_MAX) throw new DataError('invalid_input', 'note', 'Keep the note under 1,000 characters.');
  if (decision === 'deny' && !text) throw new DataError('invalid_input', 'note', 'Say why the claim is denied: the shopper sees it.');
  const claim = toClaim(unwrap(await db.rpc('decide_atoz_claim', { p_claim_id: claimId, p_grant: decision === 'grant', p_note: text || undefined })) as unknown as Row);
  if (!claim.returnId || claim.refund?.status !== 'pending') return claim;
  try {
    await refundReturn(claim.returnId);
  } catch (err) {
    console.error('[a-to-z] card refund failed', claim.returnId, err);
  }
  return (await getClaim(db, claimId)) ?? claim;
}

export type AdminClaimFilter = 'open' | 'decided' | 'all';
export const ADMIN_CLAIM_FILTERS: readonly AdminClaimFilter[] = ['open', 'decided', 'all'];
export const ADMIN_CLAIMS_PAGE_SIZE = 25;

export function claimFilter(v: unknown): AdminClaimFilter {
  return (ADMIN_CLAIM_FILTERS as readonly unknown[]).includes(v) ? (v as AdminClaimFilter) : 'open';
}

const FILTER_STATUS: Record<AdminClaimFilter, ClaimStatus[] | null> = { open: ['under_review'], decided: ['granted', 'denied'], all: null };

/** A claim as the admin queue shows it, with the seller's items in the order. */
export interface AdminClaim extends AtozClaim {
  items: { productId: string; title: string; image: string; qty: number; unitPriceMinor: number }[];
}

export interface AdminClaimPage {
  claims: AdminClaim[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<AdminClaimFilter, number>;
}

type AdminRow = Row & { orders: { order_items: { product_id: string; title: string; image: string; qty: number; unit_price_minor: number; seller: string }[] } };

/** One page of a store's claims with every filter's count: open ones oldest first, the rest newest first. */
export async function listClaimQueue(db: Db, market: Market, opts: { filter?: AdminClaimFilter; page?: number } = {}): Promise<AdminClaimPage> {
  const filter = opts.filter ?? 'open';
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const from = (page - 1) * ADMIN_CLAIMS_PAGE_SIZE;
  const count = (f: AdminClaimFilter) => {
    const q = db.from('atoz_claims').select('id', { count: 'exact', head: true }).eq('market_id', market);
    const statuses = FILTER_STATUS[f];
    return statuses ? q.in('status', statuses) : q;
  };
  let q = db
    .from('atoz_claims')
    .select(`${COLS}, orders!inner(order_items(product_id, title, image, qty, unit_price_minor, seller))`)
    .eq('market_id', market);
  const statuses = FILTER_STATUS[filter];
  if (statuses) q = q.in('status', statuses);
  const [rows, ...counts] = await Promise.all([
    q.order('created_at', { ascending: filter === 'open' }).range(from, from + ADMIN_CLAIMS_PAGE_SIZE - 1),
    ...ADMIN_CLAIM_FILTERS.map(count),
  ]);
  const totals = Object.fromEntries(
    ADMIN_CLAIM_FILTERS.map((f, n) => {
      if (counts[n].error) throw new DataError('internal', counts[n].error.message, 'Something went wrong. Please try again.');
      return [f, counts[n].count ?? 0];
    }),
  ) as Record<AdminClaimFilter, number>;
  const claims = (unwrap(rows) as unknown as AdminRow[]).map((r): AdminClaim => ({
    ...toClaim(r),
    items: r.orders.order_items
      .filter((i) => i.seller === r.seller)
      .map((i) => ({ productId: i.product_id, title: i.title, image: i.image, qty: i.qty, unitPriceMinor: i.unit_price_minor })),
  }));
  return { claims, total: totals[filter], page, pageSize: ADMIN_CLAIMS_PAGE_SIZE, counts: totals };
}
