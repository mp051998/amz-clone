import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/client';

const calls = vi.hoisted(() => [] as [string, unknown][]);

vi.mock('server-only', () => ({}));
vi.mock('./admin-orders', () => ({
  listAdminOrders: async (_db: unknown, market: unknown, opts: unknown) => {
    calls.push(['orders', { market, opts }]);
    return { orders: [], total: 4, counts: { preparing: 4, shipped: 7, refund_issues: 1 } };
  },
}));
vi.mock('./admin-returns', () => ({
  listAdminReturns: async (_db: unknown, _market: unknown, opts: unknown) => {
    calls.push(['returns', opts]);
    return { returns: [], total: 2, counts: { open: 2, refund_issues: 0 } };
  },
}));
vi.mock('./atoz-claims', () => ({
  listClaimQueue: async (_db: unknown, _market: unknown, opts: unknown) => {
    calls.push(['claims', opts]);
    return { claims: [], total: 4, counts: { open: 4, decided: 6, all: 10 } };
  },
}));
vi.mock('./admin-reviews', () => ({
  listReviewQueue: async (_db: unknown, _market: unknown, opts: unknown) => {
    calls.push(['reviews', opts]);
    return { reviews: [], total: 3, counts: { reported: 3 } };
  },
}));
vi.mock('./admin-questions', () => ({
  listQuestionQueue: async (_db: unknown, _market: unknown, opts: unknown) => {
    calls.push(['questions', opts]);
    return { questions: [], total: 5, counts: { unanswered: 5 } };
  },
}));
const support = vi.hoisted(() => ({ cases: [{ updatedAt: '2026-10-01T09:00:00Z' }, { updatedAt: '2026-10-02T09:00:00Z' }] as { updatedAt: string }[], waiting: 2 }));
vi.mock('./product-reports', () => ({
  listProductReportQueue: async (_db: unknown, _market: unknown, opts: unknown) => {
    calls.push(['reports', opts]);
    return { reports: [], total: 9, counts: { open: 9, closed: 1, all: 10 } };
  },
}));
vi.mock('./support', () => ({
  listCaseQueue: async (_db: unknown, _market: unknown, opts: unknown) => {
    calls.push(['support', opts]);
    return { cases: support.cases, total: support.waiting, counts: { waiting: support.waiting } };
  },
}));
vi.mock('./admin-catalog', () => ({
  countAdminStock: async (_db: unknown, market: unknown) => {
    calls.push(['stock', market]);
    return { out: 6, low: 8 };
  },
}));

import { adminOverview, attentionCount, type AdminOverview } from './admin-overview';

beforeEach(() => {
  calls.length = 0;
  support.cases = [{ updatedAt: '2026-10-01T09:00:00Z' }, { updatedAt: '2026-10-02T09:00:00Z' }];
  support.waiting = 2;
});

describe('adminOverview', () => {
  it('reads each queue the way its own page does and maps the counts', async () => {
    const o = await adminOverview({} as Db, 'IN');
    expect(o).toEqual({
      orders: { toShip: 4, inTransit: 7, refundIssues: 1 },
      returns: { open: 2, refundIssues: 0 },
      claims: 4,
      reportedReviews: 3,
      unansweredQuestions: 5,
      productReports: 9,
      support: { waiting: 2, oldestWaiting: '2026-10-01T09:00:00Z' },
      stock: { out: 6, low: 8 },
    });
    expect(Object.fromEntries(calls)).toEqual({
      orders: { market: 'IN', opts: { filter: 'preparing' } },
      returns: { filter: 'open' },
      claims: { filter: 'open' },
      reviews: { view: 'reported' },
      questions: { view: 'unanswered' },
      reports: { view: 'open' },
      support: { view: 'waiting' },
      stock: 'IN',
    });
  });

  it('has no oldest wait when no case is waiting', async () => {
    support.cases = [];
    support.waiting = 0;
    expect((await adminOverview({} as Db, 'US')).support).toEqual({ waiting: 0, oldestWaiting: null });
  });
});

describe('attentionCount', () => {
  const zero: AdminOverview = {
    orders: { toShip: 0, inTransit: 0, refundIssues: 0 },
    returns: { open: 0, refundIssues: 0 },
    claims: 0,
    reportedReviews: 0,
    unansweredQuestions: 0,
    productReports: 0,
    support: { waiting: 0, oldestWaiting: null },
    stock: { out: 0, low: 0 },
  };

  it('is 0 for a quiet store', () => {
    expect(attentionCount(zero)).toBe(0);
  });

  it('sums the work queues, not in-transit orders or stock levels', () => {
    const o: AdminOverview = {
      orders: { toShip: 1, inTransit: 50, refundIssues: 2 },
      returns: { open: 3, refundIssues: 4 },
      claims: 10,
      reportedReviews: 5,
      unansweredQuestions: 6,
      productReports: 8,
      support: { waiting: 7, oldestWaiting: '2026-10-01T09:00:00Z' },
      stock: { out: 9, low: 9 },
    };
    expect(attentionCount(o)).toBe(46);
  });
});
