import type { Market, Order, RefundStatus } from './types';

/**
 * A-to-z Guarantee claims, as on Amazon: when something bought from one of the store's other
 * sellers never turned up or isn't what was described, and the seller didn't sort it out within
 * 2 days of being contacted, the shopper files a claim about that seller's items in the order,
 * up to 90 days after delivery. The store reviews it; granting it refunds what's left of those
 * items at once, with nothing to send back. Items the store sells itself aren't covered: its own
 * customer service looks after those.
 */

export type ClaimReason = 'not_received' | 'not_as_described';
export type ClaimStatus = 'under_review' | 'granted' | 'denied' | 'withdrawn';

export const CLAIM_REASONS: readonly ClaimReason[] = ['not_received', 'not_as_described'];

export const CLAIM_REASON_LABEL: Record<ClaimReason, string> = {
  not_received: 'I didn’t receive it',
  not_as_described: 'It arrived damaged, defective or not as described',
};

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  under_review: 'Under review',
  granted: 'Granted',
  denied: 'Denied',
  withdrawn: 'Withdrawn',
};

/** How long after delivery a claim can be filed. */
export const CLAIM_DAYS = 90;
/** How long the seller has to answer before a claim can be filed. */
export const CLAIM_WAIT_HOURS = 48;
export const CLAIM_DETAILS_MIN = 10;
export const CLAIM_DETAILS_MAX = 2000;
export const CLAIM_NOTE_MAX = 1000;

export interface AtozClaim {
  id: string;
  orderId: string;
  market: Market;
  seller: string;
  reason: ClaimReason;
  /** what went wrong, in the shopper's words */
  details: string;
  status: ClaimStatus;
  /** the store's note on its decision (always there when denied) */
  decisionNote: string | null;
  /** the refund, once granted: a received return with reason `atoz_claim` */
  returnId: string | null;
  refund: { amountMinor: number; status: RefundStatus | null; refundedAt: string | null } | null;
  createdAt: string;
  decidedAt: string | null;
  withdrawnAt: string | null;
}

export function isClaimReason(v: unknown): v is ClaimReason {
  return (CLAIM_REASONS as readonly unknown[]).includes(v);
}

/** Whether the store itself is the seller ("Amazon.com", "Amazon.in"): claims don't cover those. */
export function soldByStore(seller: string): boolean {
  return /^amazon(\.com|\.in)?$/i.test(seller.trim());
}

/** The last day a claim can be filed about the order, or null when it can't (not delivered yet, not placed, or past it). */
export function claimOpenUntil(order: Pick<Order, 'status' | 'deliveredAt'>, now: Date = new Date()): Date | null {
  if (order.status !== 'placed' || !order.deliveredAt) return null;
  const delivered = Date.parse(order.deliveredAt);
  const until = new Date(delivered + CLAIM_DAYS * 86_400_000);
  return delivered <= now.getTime() && until.getTime() >= now.getTime() ? until : null;
}

/**
 * The sellers a claim could be filed about now: the order's other sellers (not the store itself)
 * that haven't a claim yet, unless it was withdrawn. The database checks the rest (the seller was
 * contacted 2 days ago, something of theirs is left to refund).
 */
export function claimableSellers(
  order: Pick<Order, 'status' | 'deliveredAt' | 'items'>,
  claims: readonly Pick<AtozClaim, 'seller' | 'status'>[],
  now: Date = new Date(),
): string[] {
  if (!claimOpenUntil(order, now)) return [];
  const taken = new Set(claims.filter((c) => c.status !== 'withdrawn').map((c) => c.seller));
  return [...new Set(order.items.map((i) => i.seller))].filter((s) => !soldByStore(s) && !taken.has(s));
}

/** Why a claim can't be filed (claim_not_allowed's detail), for the shopper. */
export const CLAIM_NOT_ALLOWED: Record<string, string> = {
  sold_by_amazon: 'Items sold by the store itself aren’t covered by claims. Contact customer service and we’ll put it right.',
  not_delivered: 'You can file a claim once the order has been delivered.',
  window_closed: `Claims can be filed for up to ${CLAIM_DAYS} days after delivery, and that has passed for this order.`,
  cash_on_delivery: 'You paid on delivery, so you weren’t charged for a package that didn’t arrive.',
  already_claimed: 'You’ve already filed a claim about this seller’s items in this order.',
  contact_seller_first: 'Contact the seller about this order first: most problems are sorted out that way. If they haven’t helped within 2 days, file a claim.',
  wait_for_seller: 'You contacted the seller less than 2 days ago. Give them until then to help; if they don’t, file a claim.',
  nothing_left: 'Everything from this seller in the order has already been returned or refunded.',
};
