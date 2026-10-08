import 'server-only';
import type { Db } from '../db/client';
import type { Market } from '../types';
import { countAdminStock } from './admin-catalog';
import { listAdminOrders } from './admin-orders';
import { listQuestionQueue } from './admin-questions';
import { listAdminReturns } from './admin-returns';
import { listReviewQueue } from './admin-reviews';
import { listClaimQueue } from './atoz-claims';
import { listPriceReportQueue } from './lower-price';
import { listProductReportQueue } from './product-reports';
import { listCaseQueue } from './support';

/**
 * What needs doing in a store, for the admin home (/admin, /api/v1/admin/overview): each queue's
 * count, read with the same admin functions as its own page, so the numbers match the tabs there.
 */
export interface AdminOverview {
  orders: {
    /** placed, not shipped yet */
    toShip: number;
    inTransit: number;
    refundIssues: number;
  };
  returns: { open: number; refundIssues: number };
  /** A-to-z Guarantee claims under review */
  claims: number;
  /** reviews with open reports */
  reportedReviews: number;
  unansweredQuestions: number;
  /** open reports on the store's products */
  productReports: number;
  /** lower prices shoppers told us about, not reviewed yet (not urgent, so not in attentionCount) */
  lowerPrices: number;
  support: {
    waiting: number;
    /** when the longest-waiting case last changed (the shopper wrote), if any wait */
    oldestWaiting: string | null;
  };
  stock: { out: number; low: number };
}

export async function adminOverview(db: Db, market: Market): Promise<AdminOverview> {
  const [orders, returns, claims, reviews, questions, reports, support, stock, prices] = await Promise.all([
    listAdminOrders(db, market, { filter: 'preparing' }),
    listAdminReturns(db, market, { filter: 'open' }),
    listClaimQueue(db, market, { filter: 'open' }),
    listReviewQueue(db, market, { view: 'reported' }),
    listQuestionQueue(db, market, { view: 'unanswered' }),
    listProductReportQueue(db, market, { view: 'open' }),
    listCaseQueue(db, market, { view: 'waiting' }),
    countAdminStock(db, market),
    listPriceReportQueue(db, market, { view: 'open' }),
  ]);
  return {
    orders: { toShip: orders.counts.preparing, inTransit: orders.counts.shipped, refundIssues: orders.counts.refund_issues },
    returns: { open: returns.counts.open, refundIssues: returns.counts.refund_issues },
    claims: claims.counts.open,
    reportedReviews: reviews.counts.reported,
    unansweredQuestions: questions.counts.unanswered,
    productReports: reports.counts.open,
    lowerPrices: prices.counts.open,
    support: { waiting: support.counts.waiting, oldestWaiting: support.cases[0]?.updatedAt ?? null },
    stock,
  };
}

/** How many things on the overview want an admin now (refunds, returns, claims, reviews, questions, product reports, cases, orders to ship). */
export function attentionCount(o: AdminOverview): number {
  return o.orders.toShip + o.orders.refundIssues + o.returns.open + o.returns.refundIssues + o.claims + o.reportedReviews + o.unansweredQuestions + o.productReports + o.support.waiting;
}
