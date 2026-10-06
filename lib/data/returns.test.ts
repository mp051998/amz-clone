import { describe, expect, it } from 'vitest';
import { refundBreakdown, refundTo, returnChip } from '@/components/orders/Returns';
import type { OrderReturn } from '../types';
import { canStartReturn, isReturnReason, toReturn, type OrderReturns } from './returns';

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
    expect(r.rejectNote).toBeUndefined();
    expect(toReturn({ ...row, status: 'requested', refund_status: null }).refund).toBeUndefined();
  });
});

describe('return helpers', () => {
  const base: OrderReturns = { delivered: true, returnBy: '2026-10-30T00:00:00Z', returnable: { p1: 1 }, returns: [] };
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
  });
});
