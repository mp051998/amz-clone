import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type { Db } from '../db/client';

vi.mock('server-only', () => ({}));
vi.mock('../stripe', () => ({ stripe: null }));
vi.mock('../supabase/admin', () => ({ createAdminClient: () => null }));

import { recordRefundEvent, settleRefund, type RefundStripe } from './refunds';

/** A Stripe whose PaymentIntent already has `existing` refunds; records what's created. */
function fakeStripe(existing: { id: string; status: string; metadata?: Partial<Record<string, string>> }[]) {
  const created: { amount?: number; metadata?: Stripe.MetadataParam | null; key?: string }[] = [];
  const s: RefundStripe = {
    refunds: {
      list: async () => ({ data: existing as { id: string; status: Stripe.Refund['status']; metadata?: Stripe.Metadata }[] }),
      create: async (params, options) => {
        created.push({ amount: params.amount, metadata: params.metadata as Stripe.MetadataParam, key: options.idempotencyKey });
        return { id: 're_new', status: 'pending' };
      },
    },
    checkout: { sessions: { retrieve: async () => ({ payment_intent: null }) } },
  };
  return { s, created };
}

const base = { orderId: 'o1', amountMinor: 1500, paymentIntent: 'pi_1', sessionId: null };

describe('settleRefund', () => {
  it('keeps cancelled items’ refunds apart from the order’s and returns’', async () => {
    const existing = [
      { id: 're_order', status: 'succeeded', metadata: { orderId: 'o1' } },
      { id: 're_return', status: 'pending', metadata: { orderId: 'o1', returnId: 'r1' } },
      { id: 're_c1', status: 'succeeded', metadata: { orderId: 'o1', cancellationId: 'c1' } },
    ];
    let f = fakeStripe(existing);
    expect(await settleRefund({ ...base, cancellationId: 'c1' }, f.s)).toMatchObject({ refundId: 're_c1', status: 'succeeded' });
    expect(f.created).toEqual([]);

    // a second cancellation is a refund of its own, keyed by it
    f = fakeStripe(existing);
    expect(await settleRefund({ ...base, cancellationId: 'c2' }, f.s)).toMatchObject({ refundId: 're_new', status: 'pending' });
    expect(f.created).toEqual([{ amount: 1500, metadata: { orderId: 'o1', cancellationId: 'c2' }, key: 'cancel-c2-0' }]);

    // the order's own refund (a later full cancel) isn't mistaken for an item cancellation's
    f = fakeStripe(existing.filter((r) => r.id !== 're_order'));
    expect(await settleRefund(base, f.s)).toMatchObject({ refundId: 're_new' });
    expect(f.created).toEqual([{ amount: 1500, metadata: { orderId: 'o1' }, key: 'refund-o1-0' }]);

    f = fakeStripe(existing);
    expect(await settleRefund({ ...base, returnId: 'r1' }, f.s)).toMatchObject({ refundId: 're_return' });
    expect(f.created).toEqual([]);
  });
});

describe('recordRefundEvent', () => {
  it('settles cancelled items’ refund by its cancellation id', async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const db = { rpc: async (fn: string, args: Record<string, unknown>) => (calls.push([fn, args]), { data: null, error: null }) } as unknown as Db;
    const refund = { id: 're_9', status: 'succeeded', metadata: { orderId: 'o1', cancellationId: 'c1' }, payment_intent: 'pi_1' } as unknown as Stripe.Refund;
    expect(await recordRefundEvent(refund, db)).toBe('o1');
    expect(calls).toEqual([['record_cancellation_refund', { p_cancellation_id: 'c1', p_refund_id: 're_9', p_status: 'succeeded' }]]);
  });
});
