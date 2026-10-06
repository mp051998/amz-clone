import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db/client';
import { DataError } from './errors';
import {
  feedbackOpen,
  feedbackOpenUntil,
  leaveSellerFeedback,
  orderSellers,
  parseFeedback,
  ratingText,
  removeSellerFeedback,
  sellerRatings,
} from './seller-feedback';

const NOW = new Date('2026-10-06T12:00:00Z');
const item = (seller: string) => ({ productId: seller, title: seller, image: '', seller, unitPriceMinor: 100, qty: 1 });

describe('who and when', () => {
  it("lists an order's sellers once each, in item order", () => {
    expect(orderSellers({ items: [item('B'), item('A'), item('B')] })).toEqual(['B', 'A']);
  });

  it('opens when the order arrives, for 90 days', () => {
    const arrived = { status: 'placed' as const, deliveredAt: '2026-09-01T12:00:00Z' };
    expect(feedbackOpenUntil(arrived, NOW)?.toISOString()).toBe('2026-11-30T12:00:00.000Z');
    expect(feedbackOpen(arrived, NOW)).toBe(true);
    expect(feedbackOpen({ ...arrived, deliveredAt: '2026-07-01T12:00:00Z' }, NOW)).toBe(false);
    // booked for later, cancelled, or unpaid: not yet
    expect(feedbackOpenUntil({ ...arrived, deliveredAt: '2026-10-07T12:00:00Z' }, NOW)).toBeNull();
    expect(feedbackOpenUntil({ status: 'cancelled', deliveredAt: arrived.deliveredAt }, NOW)).toBeNull();
    expect(feedbackOpenUntil({ status: 'placed', deliveredAt: undefined }, NOW)).toBeNull();
  });
});

describe('parseFeedback', () => {
  it('takes stars from a form or JSON, yes/no answers and a tidy comment', () => {
    expect(parseFeedback({ rating: '4', arrivedOnTime: 'yes', asDescribed: 'no', comment: '  Great\r\nseller ' })).toEqual({
      rating: 4,
      arrivedOnTime: true,
      asDescribed: false,
      comment: 'Great\nseller',
    });
    expect(parseFeedback({ rating: 5, arrivedOnTime: false, asDescribed: null, comment: '   ' })).toEqual({
      rating: 5,
      arrivedOnTime: false,
      asDescribed: null,
      comment: null,
    });
  });

  it('turns away what is not 1 to 5 stars, or too long', () => {
    for (const rating of [0, 6, 2.5, '', 'x', null, undefined]) {
      expect(() => parseFeedback({ rating })).toThrow(expect.objectContaining({ code: 'invalid_input', detail: 'rating' }));
    }
    expect(() => parseFeedback({ rating: 3, comment: 'x'.repeat(501) })).toThrow(expect.objectContaining({ detail: 'comment' }));
    expect(() => parseFeedback({ rating: 3, comment: 7 })).toThrow(DataError);
  });
});

describe('ratingText', () => {
  it('reads like Amazon’s seller line', () => {
    expect(ratingText({ ratings: 25, average: 4.6, positivePct: 92 })).toBe('4.6 out of 5 · 92% positive (25 ratings)');
    expect(ratingText({ ratings: 1, average: 5, positivePct: 100 })).toBe('5.0 out of 5 · 100% positive (1 rating)');
  });
});

describe('reads and writes', () => {
  const row = {
    order_id: 'ORD-1', seller: 'Kettle Co', rating: 4, arrived_on_time: true, as_described: null, comment: null,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  };

  it('sends only the answers given', async () => {
    const rpc = vi.fn(async () => ({ data: row, error: null }));
    const out = await leaveSellerFeedback({ rpc } as unknown as Db, 'ORD-1', 'Kettle Co', { rating: '4', arrivedOnTime: 'yes' });
    expect(rpc).toHaveBeenCalledWith('leave_seller_feedback', { p_order_id: 'ORD-1', p_seller: 'Kettle Co', p_rating: 4, p_on_time: true });
    expect(out).toEqual({
      orderId: 'ORD-1', seller: 'Kettle Co', rating: 4, arrivedOnTime: true, asDescribed: null, comment: null,
      createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
    });
  });

  it('says so when there was nothing to remove', async () => {
    const q = { delete: () => q, eq: () => q, select: async () => ({ data: [], error: null }) };
    await expect(removeSellerFeedback({ from: () => q } as unknown as Db, 'ORD-1', 'Kettle Co')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('turns totals into a rating per seller', async () => {
    const rpc = vi.fn(async () => ({ data: [{ seller: 'Kettle Co', ratings: 3, average: '4.3', positive: 2 }], error: null }));
    const db = { rpc } as unknown as Db;
    expect(await sellerRatings(db, 'US', ['Kettle Co', 'Mugs Inc'])).toEqual(new Map([['Kettle Co', { ratings: 3, average: 4.3, positivePct: 67 }]]));
    expect(rpc).toHaveBeenCalledWith('seller_ratings', { p_market: 'US', p_sellers: ['Kettle Co', 'Mugs Inc'] });
    rpc.mockClear();
    expect((await sellerRatings(db, 'US', [])).size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
});
