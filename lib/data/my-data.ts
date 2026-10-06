import type { Db } from '../db/client';
import type { Collection } from '../decision/types';
import { MARKETS } from '../marketplace';
import type { Address, Market, Order } from '../types';
import { listAddresses } from './addresses';
import { balanceHistory, storeBalance, type BalanceEntry } from './balance';
import { listCollections } from './collections';
import { unwrap } from './errors';
import { listOrders } from './orders';
import { plusMembership, type PlusMembership } from './plus';
import { listMyReviews, type MyReview } from './reviews';
import { myFeedback, type SellerFeedback } from './seller-feedback';

/**
 * "Request your data", as on Amazon: everything the store keeps about a shopper, in one JSON
 * file they can download from Login & security. Both stores, read as the shopper (RLS), so it
 * holds only what is theirs.
 */
export interface MyData {
  exportedAt: string;
  account: { id: string; email: string | null; name: string | null; createdAt: string | null };
  plus: PlusMembership | null;
  stores: Record<Market, StoreData>;
  returns: ReturnRecord[];
  questions: { id: string; productId: string; body: string; createdAt: string }[];
  answers: { id: string; questionId: string; body: string; createdAt: string }[];
  sellerFeedback: SellerFeedback[];
}

export interface StoreData {
  currency: string;
  orders: Order[];
  addresses: Address[];
  lists: ListRecord[];
  reviews: ReviewRecord[];
  giftCardBalanceMinor: number;
  balanceHistory: BalanceEntry[];
}

export interface ListRecord {
  id: string;
  name: string;
  note: string;
  kind: 'custom' | 'considering' | 'later';
  shared: boolean;
  createdAt: string;
  items: { productId: string; title: string; savedPriceMinor: number; addedAt: string }[];
}

export interface ReviewRecord {
  id: string;
  productId: string;
  productTitle: string;
  rating: number;
  title: string;
  body: string;
  verified: boolean;
  createdAt: string;
}

export interface ReturnRecord {
  id: string;
  orderId: string;
  status: string;
  reason: string;
  comment: string | null;
  items: { productId: string; qty: number }[];
  refundMinor: number;
  refundStatus: string | null;
  createdAt: string;
  receivedAt: string | null;
  refundedAt: string | null;
  cancelledAt: string | null;
  rejectedAt: string | null;
}

const BALANCE_ENTRIES = 1000;

export function listRecord(c: Collection): ListRecord {
  return {
    id: c.id,
    name: c.name,
    note: c.note,
    kind: c.kind ?? 'custom',
    shared: Boolean(c.shareToken),
    createdAt: c.createdAt,
    items: c.items.map((i) => ({ productId: i.product.id, title: i.product.title, savedPriceMinor: i.savedPriceMinor, addedAt: i.addedAt })),
  };
}

export function reviewRecord({ review, product }: MyReview): ReviewRecord {
  return {
    id: review.id,
    productId: product.id,
    productTitle: product.title,
    rating: review.rating,
    title: review.title,
    body: review.body,
    verified: review.verified,
    createdAt: review.createdAt,
  };
}

/** "amz-clone-data-2026-10-06.json", dated in UTC. */
export function dataFileName(now: Date): string {
  return `amz-clone-data-${now.toISOString().slice(0, 10)}.json`;
}

async function storeData(db: Db, market: Market, userId: string): Promise<StoreData> {
  const [orders, addresses, collections, reviews, balance, history] = await Promise.all([
    listOrders(db, market),
    listAddresses(db, market),
    listCollections(db, market),
    listMyReviews(db, market, userId),
    storeBalance(db, market),
    balanceHistory(db, market, BALANCE_ENTRIES),
  ]);
  return {
    currency: MARKETS[market].currency.code,
    orders,
    addresses,
    lists: collections.map(listRecord),
    reviews: reviews.map(reviewRecord),
    giftCardBalanceMinor: balance ?? 0,
    balanceHistory: history,
  };
}

/** Everything about the signed-in shopper. `user` is the session's user. */
export async function exportMyData(db: Db, user: { id: string; email: string | null; name?: string }, now = new Date()): Promise<MyData> {
  // admins can read every return, so each query names the shopper rather than leaning on RLS
  const [profile, plus, US, IN, returns, questions, answers, sellerFeedback] = await Promise.all([
    db.from('profiles').select('display_name, created_at').eq('id', user.id).maybeSingle().then(unwrap),
    plusMembership(db),
    storeData(db, 'US', user.id),
    storeData(db, 'IN', user.id),
    db
      .from('returns')
      .select('id, order_id, status, reason, comment, refund_minor, refund_status, created_at, received_at, refunded_at, cancelled_at, rejected_at, return_items(product_id, qty)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(unwrap),
    db.from('product_questions').select('id, product_id, body, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).then(unwrap),
    db.from('product_answers').select('id, question_id, body, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).then(unwrap),
    myFeedback(db, user.id),
  ]);
  return {
    exportedAt: now.toISOString(),
    account: { id: user.id, email: user.email, name: profile?.display_name || user.name || null, createdAt: profile?.created_at ?? null },
    plus,
    stores: { US, IN },
    returns: returns.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      status: r.status,
      reason: r.reason,
      comment: r.comment,
      items: r.return_items.map((i) => ({ productId: i.product_id, qty: i.qty })),
      refundMinor: r.refund_minor,
      refundStatus: r.refund_status,
      createdAt: r.created_at,
      receivedAt: r.received_at,
      refundedAt: r.refunded_at,
      cancelledAt: r.cancelled_at,
      rejectedAt: r.rejected_at,
    })),
    questions: questions.map((q) => ({ id: q.id, productId: q.product_id, body: q.body, createdAt: q.created_at })),
    answers: answers.map((a) => ({ id: a.id, questionId: a.question_id, body: a.body, createdAt: a.created_at })),
    sellerFeedback,
  };
}
