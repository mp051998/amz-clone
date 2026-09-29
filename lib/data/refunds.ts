import 'server-only';
import type Stripe from 'stripe';
import type { Db } from '../db/client';
import { stripe } from '../stripe';
import { createAdminClient } from '../supabase/admin';
import type { RefundStatus } from '../types';
import { DataError, unwrap } from './errors';

/**
 * Card refunds for cancelled orders. The database decides that an order is owed a
 * refund (`refund_status = 'pending'`, amount in `refund_minor`); this module asks
 * Stripe for it and records Stripe's answer with the service role. Safe to repeat:
 * a refund already under way on the PaymentIntent is reused, and new ones carry an
 * idempotency key, so two concurrent calls create one refund.
 */

type StripeRefund = Pick<Stripe.Refund, 'id' | 'status'>;

/** The slice of the Stripe client used here (tests pass a fake). */
export interface RefundStripe {
  refunds: {
    list(params: { payment_intent: string; limit: number }): Promise<{ data: StripeRefund[] }>;
    create(params: Stripe.RefundCreateParams, options: Stripe.RequestOptions): Promise<StripeRefund>;
  };
  checkout: { sessions: { retrieve(id: string): Promise<Pick<Stripe.Checkout.Session, 'payment_intent'>> } };
}

export type RefundState = Exclude<RefundStatus, 'not_charged'>;

/** Stripe refund status → ours: requires_action is still under way; canceled never paid out. */
export function refundState(status: string | null | undefined): RefundState {
  switch (status) {
    case 'succeeded':
      return 'succeeded';
    case 'pending':
    case 'requires_action':
      return 'pending';
    default:
      return 'failed';
  }
}

const UNDER_WAY = new Set(['pending', 'requires_action', 'succeeded']);

export interface RefundTarget {
  orderId: string;
  amountMinor: number;
  paymentIntent: string | null;
  sessionId: string | null;
}

export interface RefundResult {
  paymentIntent: string | null;
  refundId: string | null;
  status: RefundState;
}

/** Ask Stripe for the refund (or find the one already under way). Never throws. */
export async function settleRefund(target: RefundTarget, s: RefundStripe): Promise<RefundResult> {
  let paymentIntent = target.paymentIntent;
  try {
    if (!paymentIntent && target.sessionId) {
      const pi = (await s.checkout.sessions.retrieve(target.sessionId)).payment_intent;
      paymentIntent = typeof pi === 'string' ? pi : pi?.id ?? null;
    }
    if (!paymentIntent) {
      console.error('[stripe] refund: no payment for order', target.orderId);
      return { paymentIntent: null, refundId: null, status: 'failed' };
    }
    const { data } = await s.refunds.list({ payment_intent: paymentIntent, limit: 100 });
    const refund =
      data.find((r) => UNDER_WAY.has(r.status ?? '')) ??
      (await s.refunds.create(
        { payment_intent: paymentIntent, amount: target.amountMinor, metadata: { orderId: target.orderId } },
        // one key per attempt: a retry after a failed refund gets a fresh one
        { idempotencyKey: `refund-${target.orderId}-${data.length}` },
      ));
    return { paymentIntent, refundId: refund.id, status: refundState(refund.status) };
  } catch (err) {
    console.error('[stripe] refund failed', target.orderId, err instanceof Error ? err.message : err);
    return { paymentIntent, refundId: null, status: 'failed' };
  }
}

export interface RefundDeps {
  /** defaults to the configured Stripe client; null means Stripe isn't set up */
  stripe?: RefundStripe | null;
  /** service-role client */
  db?: Db;
}

/**
 * Refund a cancelled card order whose refund is pending or failed, and record the
 * outcome. Returns the order's refund status afterwards (unchanged when there's
 * nothing to do; still `pending` when Stripe isn't configured).
 */
export async function refundOrder(orderId: string, deps: RefundDeps = {}): Promise<RefundStatus | null> {
  const db = deps.db ?? createAdminClient();
  const s = deps.stripe === undefined ? stripe : deps.stripe;
  const row = unwrap(
    await db
      .from('orders')
      .select('id, payment_method, total_minor, refund_status, refund_minor, stripe_payment_intent, stripe_session_id')
      .eq('id', orderId)
      .maybeSingle(),
  );
  if (!row) throw new DataError('order_not_found');
  const current = row.refund_status as RefundStatus | null;
  if (row.payment_method !== 'card' || (current !== 'pending' && current !== 'failed') || !s) return current;

  const result = await settleRefund(
    {
      orderId,
      amountMinor: row.refund_minor ?? row.total_minor,
      paymentIntent: row.stripe_payment_intent,
      sessionId: row.stripe_session_id,
    },
    s,
  );
  if (result.paymentIntent && !row.stripe_payment_intent) {
    await db.rpc('record_payment_intent', { p_order_id: orderId, p_payment_intent: result.paymentIntent });
  }
  unwrap(await db.rpc('record_refund', { p_order_id: orderId, p_refund_id: result.refundId, p_status: result.status }));
  return result.status;
}

/**
 * Webhook: Stripe reports a refund created or changed. The order is found by the
 * refund's `metadata.orderId` (set by settleRefund), else by its PaymentIntent.
 * Returns the order id, or null for refunds that aren't ours.
 */
export async function recordRefundEvent(refund: Stripe.Refund, db: Db = createAdminClient()): Promise<string | null> {
  let orderId = refund.metadata?.orderId ?? null;
  const pi = typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id;
  if (!orderId && pi) {
    const row = unwrap(await db.from('orders').select('id').eq('stripe_payment_intent', pi).maybeSingle());
    orderId = row?.id ?? null;
  }
  if (!orderId) return null;
  unwrap(await db.rpc('record_refund', { p_order_id: orderId, p_refund_id: refund.id, p_status: refundState(refund.status) }));
  return orderId;
}
