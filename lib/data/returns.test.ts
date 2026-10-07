import { describe, expect, it, vi } from 'vitest';
import { refundBreakdown, refundTo, returnChip } from '@/components/orders/Returns';
import type { Db } from '../db/client';
import type { Order, OrderReturn } from '../types';
import { DataError } from './errors';
import { canStartReturn, isReturnReason, reportMissingUntil, requestReturn, toReturn, type OrderReturns } from './returns';

const row = {
  id: 'r1',
  order_id: '114-0000000-0000000',
  status: 'received',
  reason: 'damaged',
  comment: '',
  items: [{ product_id: 'p1', title: 'Lamp', image: '/i.png', unit_price_minor: 2000, qty: 2 }],
  items_minor: 4000,
  tax_minor: 320,
  ship_minor: 0,
  refund_minor: 4320,
  refund_status: 'pending',
  refunded_at: null,
  dropoff_code: 'AB12-CD34',
  dropoff_by: '2026-10-14T00:00:00Z',
  reject_note: null,
  created_at: '2026-09-30T00:00:00Z',
  received_at: '2026-10-02T00:00:00Z',
};

describe('toReturn', () => {
  it('maps the database shape, leaving empty optionals out', () => {
    const r = toReturn(row);
    expect(r).toMatchObject({
      id: 'r1',
      status: 'received',
      items: [{ productId: 'p1', title: 'Lamp', unitPriceMinor: 2000, qty: 2 }],
      refundMinor: 4320,
      refund: { status: 'pending', refundedAt: undefined },
      receivedAt: '2026-10-02T00:00:00Z',
    });
    expect(r.comment).toBeUndefined();
    expect(r.resolution).toBe('refund');
    expect(r.replacement).toBeUndefined();
    expect(r.rejectNote).toBeUndefined();
    expect(toReturn({ ...row, status: 'requested', refund_status: null }).refund).toBeUndefined();
    expect(toReturn(row).protectionMinor).toBeUndefined();
    expect(toReturn({ ...row, protection_minor: 398, refund_minor: 4718 })).toMatchObject({ protectionMinor: 398, refundMinor: 4718 });
  });
});

describe('return helpers', () => {
  const base: OrderReturns = { delivered: true, returnBy: '2026-10-30T00:00:00Z', returnable: { p1: 1 }, replaceable: {}, returns: [] };
  const now = new Date('2026-10-01T00:00:00Z');

  it('opens only when delivered, inside the window, with something left', () => {
    expect(canStartReturn(base, now)).toBe(true);
    expect(canStartReturn({ ...base, delivered: false }, now)).toBe(false);
    expect(canStartReturn({ ...base, returnBy: undefined }, now)).toBe(false);
    expect(canStartReturn(base, new Date('2026-10-31T00:00:00Z'))).toBe(false);
    expect(canStartReturn({ ...base, returnable: { p1: 0 } }, now)).toBe(false);
  });

  it('knows the reasons', () => {
    expect(isReturnReason('defective')).toBe(true);
    expect(isReturnReason('changed_mind')).toBe(false);
  });

  it('labels where a return stands', () => {
    const r = toReturn(row);
    expect(returnChip(r).label).toBe('Refund pending');
    expect(returnChip({ ...r, refund: { status: 'succeeded' } }).label).toBe('Refunded');
    expect(returnChip({ ...r, refund: { status: 'failed' } }).label).toBe('Refund failed');
    expect(returnChip({ ...r, status: 'requested', refund: undefined } as OrderReturn).label).toBe('Return started');
    expect(returnChip({ ...r, status: 'rejected' }).label).toBe('Not accepted');
  });

  it('says where the money goes and what it is made of', () => {
    expect(refundTo('card', 'Visa ending 4242')).toBe('Visa ending 4242');
    expect(refundTo('cod', '')).toBe('your bank account');
    expect(refundTo('giftcard', 'Gift card')).toBe('your gift card balance');
    expect(refundTo('upi', 'UPI · riley@okbank')).toBe('UPI · riley@okbank');
    expect(refundBreakdown(toReturn(row), 'USD')).toBe('Items $40.00 · tax $3.20');
    expect(refundBreakdown(toReturn({ ...row, tax_minor: 0, ship_minor: 599 }), 'USD')).toBe('Items $40.00 · delivery $5.99');
    expect(refundBreakdown(toReturn({ ...row, protection_minor: 398 }), 'USD')).toBe('Items $40.00 · tax $3.20 · protection plan $3.98');
  });
});

describe('replacements', () => {
  const swap = {
    ...row,
    status: 'requested',
    resolution: 'replacement',
    items_minor: 0,
    tax_minor: 0,
    refund_minor: 0,
    refund_status: null,
    replacement_shipped_at: '2026-10-01T10:00:00Z',
    replacement_delivered_at: '2026-10-03T18:30:00Z',
  };

  it('maps the resolution and the replacement’s delivery', () => {
    expect(toReturn(swap)).toMatchObject({
      resolution: 'replacement',
      replacement: { shippedAt: '2026-10-01T10:00:00Z', deliveredAt: '2026-10-03T18:30:00Z' },
      refundMinor: 0,
    });
  });

  it('labels a replacement by where the new item is, until the return closes', () => {
    const r = toReturn(swap);
    expect(returnChip(r, new Date('2026-10-02T00:00:00Z'))).toEqual({ label: 'Replacement on its way', tone: 'warn' });
    expect(returnChip(r, new Date('2026-10-04T00:00:00Z'))).toEqual({ label: 'Replacement delivered', tone: 'good' });
    expect(returnChip({ ...r, status: 'received', refund: { status: 'succeeded' } }, new Date('2026-10-04T00:00:00Z')).label).toBe('Replacement delivered');
    expect(returnChip({ ...r, status: 'cancelled' }).label).toBe('Cancelled');
  });

  function fakeDb() {
    const rpc = vi.fn(async () => ({ data: swap, error: null }));
    return { db: { rpc } as unknown as Db, rpc };
  }
  const items = [{ productId: 'p1', qty: 1 }];
  const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: DataError) => `${e.code}:${e.detail}`);

  it('asks for one only with a store-fault reason', async () => {
    const { db, rpc } = fakeDb();
    expect(await code(requestReturn(db, 'o1', { items, reason: 'no_longer_needed', resolution: 'replacement' }))).toBe('invalid_input:resolution');
    expect(await code(requestReturn(db, 'o1', { items, reason: 'damaged', resolution: 'exchange' }))).toBe('invalid_input:resolution');
    expect(rpc).not.toHaveBeenCalled();
    expect(await requestReturn(db, 'o1', { items, reason: 'damaged', resolution: 'replacement' })).toMatchObject({ resolution: 'replacement' });
    expect(rpc).toHaveBeenLastCalledWith('request_return', expect.objectContaining({ p_reason: 'damaged', p_resolution: 'replacement' }));
  });

  it('leaves the resolution out for a refund', async () => {
    const { db, rpc } = fakeDb();
    await requestReturn(db, 'o1', { items, reason: 'damaged', resolution: 'refund' });
    await requestReturn(db, 'o1', { items, reason: 'better_price' });
    for (const [, args] of rpc.mock.calls as unknown as [string, Record<string, unknown>][]) expect(args).not.toHaveProperty('p_resolution');
  });
});

describe('package didn’t arrive', () => {
  const order = (over: Partial<Order> = {}): Order => ({
    id: '114-0000000-0000000',
    market: 'US',
    currency: 'USD',
    status: 'placed',
    paymentMethod: 'card',
    paymentLabel: 'Visa ending 4242',
    totals: { subtotalMinor: 4000, shipMinor: 0, taxMinor: 320, totalMinor: 4320 },
    shipTo: { name: 'Asha Rao', phone: '5550100', line1: '1 Main St', city: 'Austin', state: 'TX', postcode: '78701' },
    items: [],
    createdAt: '2026-09-28T00:00:00Z',
    deliveredAt: '2026-10-01T18:00:00Z',
    ...over,
  });
  const none: OrderReturns = { delivered: true, returnBy: '2026-10-31T18:00:00Z', returnable: { p1: 2 }, replaceable: {}, returns: [] };
  const at = (iso: string) => new Date(iso);

  it('can be reported from delivery until 30 days after, while nothing has been returned', () => {
    expect(reportMissingUntil(order(), none, at('2026-10-02T00:00:00Z'))?.toISOString()).toBe('2026-10-31T18:00:00.000Z');
    expect(reportMissingUntil(order(), none, at('2026-10-01T17:00:00Z'))).toBeNull();
    expect(reportMissingUntil(order(), none, at('2026-10-31T19:00:00Z'))).toBeNull();
    expect(reportMissingUntil(order({ deliveredAt: undefined }), none, at('2026-10-02T00:00:00Z'))).toBeNull();
    expect(reportMissingUntil(order(), null, at('2026-10-02T00:00:00Z'))).toBeNull();
  });

  it('not once something came back or it was reported, nor for cash on delivery', () => {
    const now = at('2026-10-02T00:00:00Z');
    const r = toReturn(row);
    expect(reportMissingUntil(order(), { ...none, returns: [r] }, now)).toBeNull();
    expect(reportMissingUntil(order(), { ...none, returns: [{ ...r, status: 'cancelled' }] }, now)).not.toBeNull();
    expect(reportMissingUntil(order({ paymentMethod: 'cod', paymentLabel: 'Cash on Delivery' }), none, now)).toBeNull();
    expect(reportMissingUntil(order({ status: 'cancelled' }), none, now)).toBeNull();
  });

  it('refunds the gift wrap too, and can’t be asked for as a return reason', () => {
    const r = toReturn({ ...row, reason: 'not_received', wrap_minor: 399, refund_minor: 4719 });
    expect(r).toMatchObject({ reason: 'not_received', wrapMinor: 399, refundMinor: 4719 });
    expect(refundBreakdown(r, 'USD')).toBe('Items $40.00 · tax $3.20 · gift wrap $3.99');
    expect(toReturn(row).wrapMinor).toBeUndefined();
    expect(isReturnReason('not_received')).toBe(false);
  });
});
