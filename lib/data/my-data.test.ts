import { beforeEach, describe, expect, it, vi } from 'vitest';
import { product } from '@/test/fixtures/decision';
import type { Db } from '@/lib/db/client';

const parts = vi.hoisted(() => ({
  listOrders: vi.fn(),
  listAddresses: vi.fn(),
  listCollections: vi.fn(),
  listMyReviews: vi.fn(),
  storeBalance: vi.fn(),
  balanceHistory: vi.fn(),
  plusMembership: vi.fn(),
}));
vi.mock('./orders', () => ({ listOrders: parts.listOrders }));
vi.mock('./addresses', () => ({ listAddresses: parts.listAddresses }));
vi.mock('./collections', () => ({ listCollections: parts.listCollections }));
vi.mock('./reviews', () => ({ listMyReviews: parts.listMyReviews }));
vi.mock('./balance', () => ({ storeBalance: parts.storeBalance, balanceHistory: parts.balanceHistory }));
vi.mock('./plus', () => ({ plusMembership: parts.plusMembership }));

import { dataFileName, exportMyData, listRecord, reviewRecord } from './my-data';

const kettle = product({ id: 'kettle', title: 'Electric Kettle 1.7L' });

describe('shaping the export', () => {
  it('keeps a list and what is on it, without the whole product', () => {
    expect(
      listRecord({
        id: 'c1',
        name: 'Kitchen',
        note: 'for the new flat',
        createdAt: '2026-09-01T00:00:00Z',
        shareToken: 'tok',
        items: [{ product: kettle, savedPriceMinor: 2999, addedAt: '2026-09-02T00:00:00Z' }],
      }),
    ).toEqual({
      id: 'c1',
      name: 'Kitchen',
      note: 'for the new flat',
      kind: 'custom',
      shared: true,
      createdAt: '2026-09-01T00:00:00Z',
      items: [{ productId: 'kettle', title: 'Electric Kettle 1.7L', savedPriceMinor: 2999, addedAt: '2026-09-02T00:00:00Z' }],
    });
  });

  it('keeps a review and the product it is about', () => {
    const review = {
      id: 'r1', author: 'Asha', initial: 'A', rating: 4, title: 'Boils fast', body: 'Quiet too.', createdAt: '2026-09-10T00:00:00Z',
      verified: true, helpful: 3, mine: true, votedHelpful: false, reported: false,
    };
    expect(reviewRecord({ review, product: kettle })).toEqual({
      id: 'r1', productId: 'kettle', productTitle: 'Electric Kettle 1.7L', rating: 4, title: 'Boils fast', body: 'Quiet too.',
      verified: true, createdAt: '2026-09-10T00:00:00Z',
    });
  });

  it('names the file for the day it was made', () => {
    expect(dataFileName(new Date('2026-10-06T23:30:00Z'))).toBe('amz-clone-data-2026-10-06.json');
  });
});

describe('exportMyData', () => {
  const rows: Record<string, unknown> = {
    profiles: { display_name: 'Asha Rao', created_at: '2026-01-01T00:00:00Z' },
    returns: [
      {
        id: 'RET-1', order_id: 'ORD-1', status: 'requested', reason: 'damaged', comment: null, refund_minor: 2999, refund_status: null,
        created_at: '2026-10-02T00:00:00Z', received_at: null, refunded_at: null, cancelled_at: null, rejected_at: null,
        return_items: [{ product_id: 'kettle', qty: 1 }],
      },
    ],
    product_questions: [{ id: 'q1', product_id: 'kettle', body: 'Is it cordless?', created_at: '2026-09-03T00:00:00Z' }],
    product_answers: [{ id: 'a1', question_id: 'q9', body: 'Yes.', created_at: '2026-09-04T00:00:00Z' }],
  };
  const filters: [string, string, unknown][] = [];
  const db = {
    from(table: string) {
      const q = {
        select: () => q,
        order: () => q,
        maybeSingle: () => q,
        eq: (col: string, val: unknown) => (filters.push([table, col, val]), q),
        then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve({ data: rows[table], error: null }).then(ok, bad),
      };
      return q;
    },
  } as unknown as Db;

  beforeEach(() => {
    filters.length = 0;
    parts.listOrders.mockImplementation(async (_db, m) => (m === 'IN' ? [{ id: 'ORD-1' }] : []));
    parts.listAddresses.mockResolvedValue([]);
    parts.listCollections.mockResolvedValue([]);
    parts.listMyReviews.mockResolvedValue([]);
    parts.storeBalance.mockImplementation(async (_db, m) => (m === 'US' ? 2500 : null));
    parts.balanceHistory.mockResolvedValue([]);
    parts.plusMembership.mockResolvedValue({ since: '2026-05-01T00:00:00Z' });
  });

  it('gathers both stores and what was posted, all filtered to the shopper', async () => {
    const data = await exportMyData(db, { id: 'u1', email: 'asha@example.test', name: 'Asha' }, new Date('2026-10-06T12:00:00Z'));
    expect(data.exportedAt).toBe('2026-10-06T12:00:00.000Z');
    expect(data.account).toEqual({ id: 'u1', email: 'asha@example.test', name: 'Asha Rao', createdAt: '2026-01-01T00:00:00Z' });
    expect(data.plus).toEqual({ since: '2026-05-01T00:00:00Z' });
    expect(data.stores.US).toMatchObject({ currency: 'USD', orders: [], giftCardBalanceMinor: 2500 });
    // a balance that can't be read exports as none
    expect(data.stores.IN).toMatchObject({ currency: 'INR', orders: [{ id: 'ORD-1' }], giftCardBalanceMinor: 0 });
    expect(data.returns).toEqual([
      {
        id: 'RET-1', orderId: 'ORD-1', status: 'requested', reason: 'damaged', comment: null, items: [{ productId: 'kettle', qty: 1 }],
        refundMinor: 2999, refundStatus: null, createdAt: '2026-10-02T00:00:00Z', receivedAt: null, refundedAt: null, cancelledAt: null,
        rejectedAt: null,
      },
    ]);
    expect(data.questions).toEqual([{ id: 'q1', productId: 'kettle', body: 'Is it cordless?', createdAt: '2026-09-03T00:00:00Z' }]);
    expect(data.answers).toEqual([{ id: 'a1', questionId: 'q9', body: 'Yes.', createdAt: '2026-09-04T00:00:00Z' }]);
    expect(parts.listMyReviews).toHaveBeenCalledWith(db, 'US', 'u1');
    expect(parts.listMyReviews).toHaveBeenCalledWith(db, 'IN', 'u1');
    expect(parts.balanceHistory).toHaveBeenCalledWith(db, 'US', 1000);
    // admins can read every return: each table is filtered to the shopper, not left to RLS
    expect(filters).toEqual(
      expect.arrayContaining([
        ['profiles', 'id', 'u1'],
        ['returns', 'user_id', 'u1'],
        ['product_questions', 'user_id', 'u1'],
        ['product_answers', 'user_id', 'u1'],
      ]),
    );
  });

  it("falls back to the session's name before the profile exists", async () => {
    rows.profiles = null;
    const data = await exportMyData(db, { id: 'u1', email: null });
    expect(data.account).toEqual({ id: 'u1', email: null, name: null, createdAt: null });
    expect((await exportMyData(db, { id: 'u1', email: null, name: 'Asha' })).account.name).toBe('Asha');
  });
});
