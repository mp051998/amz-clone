import 'server-only';
import type Stripe from 'stripe';
import type { Db } from '../db/client';
import { stripe } from '../stripe';
import { createAdminClient } from '../supabase/admin';
import type { RefundStatus } from '../types';
import { DataError, unwrap } from './errors';

/**
 * Card refunds for cancelled orders, cancelled items (and pre-order price drops, kept as
 * cancellations without items) and received returns. The
 * database decides that an order (or some cancelled items, or a return) is owed a
 * refund (`refund_status = 'pending'`, with the amount); this module asks Stripe for
 * it and records Stripe's answer with the service role. Safe to repeat: a refund
 * already under way for the same order, cancellation or return is reused, and new
 * ones carry an idempotency key, so two concurrent calls create one refund. A
 * return's refunds carry `metadata.returnId` and cancelled items' carry
 * `metadata.cancellationId`, which keeps them apart from the order's own (a
 * PaymentIntent can have several of each).
 *
 * An order paid partly from the shopper's balance (split payment) has the balance's part of each
 * refund, `balance_refund_minor`, credited by the database; Stripe refunds the rest.
 */

type StripeRefund = Pick<Stripe.Refund, 'id' | 'status'> & { metadata?: Stripe.Metadata | null };

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
  /** set when refunding a return rather than a cancelled order */
  returnId?: string;
  /** set when refunding some cancelled items rather than a cancelled order */
  cancellationId?: string;
  amountMinor: number;
  paymentIntent: string | null;
  sessionId: string | null;
}

export interface RefundResult {
  paymentIntent: string | null;
  refundId: string | null;
  status: RefundState;
}

/** Which refund of a payment a refund is: a return's, some cancelled items', or the order's own. */
function refundFor(m: { returnId?: string; cancellationId?: string }): string {
  return m.returnId ? `return-${m.returnId}` : m.cancellationId ? `cancel-${m.cancellationId}` : 'order';
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
    const which = refundFor(target);
    const mine = data.filter((r) => refundFor({ returnId: r.metadata?.returnId, cancellationId: r.metadata?.cancellationId }) === which);
    const refund =
      mine.find((r) => UNDER_WAY.has(r.status ?? '')) ??
      (await s.refunds.create(
        {
          payment_intent: paymentIntent,
          amount: target.amountMinor,
          metadata: {
            orderId: target.orderId,
            ...(target.returnId ? { returnId: target.returnId } : {}),
            ...(target.cancellationId ? { cancellationId: target.cancellationId } : {}),
          },
        },
        // one key per attempt: a retry after a failed refund gets a fresh one
        { idempotencyKey: which === 'order' ? `refund-${target.orderId}-${mine.length}` : `${which}-${mine.length}` },
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
      .select('id, payment_method, total_minor, refund_status, refund_minor, balance_refund_minor, stripe_payment_intent, stripe_session_id')
      .eq('id', orderId)
      .maybeSingle(),
  );
  if (!row) throw new DataError('order_not_found');
  const current = row.refund_status as RefundStatus | null;
  if (row.payment_method !== 'card' || (current !== 'pending' && current !== 'failed') || !s) return current;

  const result = await settleRefund(
    {
      orderId,
      amountMinor: (row.refund_minor ?? row.total_minor) - (row.balance_refund_minor ?? 0),
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
 * Refund a received card return whose refund is pending or failed, and record the
 * outcome. Returns the return's refund status afterwards (unchanged when there's
 * nothing to do; still `pending` when Stripe isn't configured).
 */
export async function refundReturn(returnId: string, deps: RefundDeps = {}): Promise<RefundState | null> {
  const db = deps.db ?? createAdminClient();
  const s = deps.stripe === undefined ? stripe : deps.stripe;
  const row = unwrap(
    await db
      .from('returns')
      .select('id, order_id, refund_status, refund_minor, balance_refund_minor, orders!inner(payment_method, stripe_payment_intent, stripe_session_id)')
      .eq('id', returnId)
      .maybeSingle(),
  );
  if (!row) throw new DataError('return_not_found');
  const current = row.refund_status as RefundState | null;
  const order = row.orders;
  if (order.payment_method !== 'card' || (current !== 'pending' && current !== 'failed') || !s) return current;

  const result = await settleRefund(
    {
      orderId: row.order_id,
      returnId,
      amountMinor: row.refund_minor - (row.balance_refund_minor ?? 0),
      paymentIntent: order.stripe_payment_intent,
      sessionId: order.stripe_session_id,
    },
    s,
  );
  if (result.paymentIntent && !order.stripe_payment_intent) {
    await db.rpc('record_payment_intent', { p_order_id: row.order_id, p_payment_intent: result.paymentIntent });
  }
  unwrap(await db.rpc('record_return_refund', { p_return_id: returnId, p_refund_id: result.refundId, p_status: result.status }));
  return result.status;
}

/**
 * Refund some cancelled items of a card order whose refund is pending or failed, and
 * record the outcome. Returns the cancellation's refund status afterwards (unchanged
 * when there's nothing to do; still `pending` when Stripe isn't configured).
 */
export async function refundCancellation(cancellationId: string, deps: RefundDeps = {}): Promise<RefundStatus | null> {
  const db = deps.db ?? createAdminClient();
  const s = deps.stripe === undefined ? stripe : deps.stripe;
  const row = unwrap(
    await db
      .from('order_cancellations')
      .select('id, order_id, refund_status, refund_minor, balance_refund_minor, orders!inner(payment_method, stripe_payment_intent, stripe_session_id)')
      .eq('id', cancellationId)
      .maybeSingle(),
  );
  if (!row) throw new DataError('order_not_found');
  const current = row.refund_status as RefundStatus;
  const order = row.orders;
  if (order.payment_method !== 'card' || (current !== 'pending' && current !== 'failed') || !s) return current;

  const result = await settleRefund(
    {
      orderId: row.order_id,
      cancellationId,
      amountMinor: row.refund_minor - (row.balance_refund_minor ?? 0),
      paymentIntent: order.stripe_payment_intent,
      sessionId: order.stripe_session_id,
    },
    s,
  );
  if (result.paymentIntent && !order.stripe_payment_intent) {
    await db.rpc('record_payment_intent', { p_order_id: row.order_id, p_payment_intent: result.paymentIntent });
  }
  unwrap(
    await db.rpc('record_cancellation_refund', { p_cancellation_id: cancellationId, p_refund_id: result.refundId, p_status: result.status }),
  );
  return result.status;
}

/**
 * After an admin reprices a product: ask Stripe for the Pre-order Price Guarantee refunds the
 * database owes card orders of it (a price drop before the end of its release day writes them as
 * pending). Each is refunded as cancelled items are; one that fails stays owed, for the order's
 * "Retry refund". Never throws.
 */
export async function refundPriceGuarantees(productId: string, deps: RefundDeps = {}): Promise<void> {
  try {
    const db = deps.db ?? createAdminClient();
    const owed = unwrap(
      await db
        .from('order_cancellations')
        .select('id, orders!inner(payment_method)')
        .eq('kind', 'price_guarantee')
        .eq('product_id', productId)
        .eq('refund_status', 'pending')
        .eq('orders.payment_method', 'card'),
    );
    for (const c of owed) await refundCancellation(c.id, { ...deps, db });
  } catch (err) {
    console.error('[stripe] price guarantee refunds failed', productId, err instanceof Error ? err.message : err);
  }
}

/**
 * Webhook: Stripe reports a refund created or changed. A return's refund is found by
 * `metadata.returnId`, cancelled items' by `metadata.cancellationId`, an order's by
 * `metadata.orderId` (all set by settleRefund), else by its PaymentIntent. Returns the
 * order id, or null for refunds that aren't ours.
 */
export async function recordRefundEvent(refund: Stripe.Refund, db: Db = createAdminClient()): Promise<string | null> {
  const returnId = refund.metadata?.returnId;
  if (returnId) {
    unwrap(await db.rpc('record_return_refund', { p_return_id: returnId, p_refund_id: refund.id, p_status: refundState(refund.status) }));
    return refund.metadata?.orderId ?? null;
  }
  const cancellationId = refund.metadata?.cancellationId;
  if (cancellationId) {
    unwrap(
      await db.rpc('record_cancellation_refund', {
        p_cancellation_id: cancellationId,
        p_refund_id: refund.id,
        p_status: refundState(refund.status),
      }),
    );
    return refund.metadata?.orderId ?? null;
  }
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
