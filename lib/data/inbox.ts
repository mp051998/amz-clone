import type { Db } from '../db/client';
import { trackingSteps } from '../decision/tracking';
import type { Market, Order } from '../types';
import { unwrap } from './errors';
import { listOrders } from './orders';
import { awaitingReview, type ToReview } from './reviews';

/**
 * "Your messages": what's happened lately with the shopper's orders, returns, support cases and
 * questions in a store, newest first, as on Amazon's Message Center. It's built from what the store
 * already keeps:
 * - order milestones: shipped, out for delivery, delivered, cancelled, refunded
 * - items cancelled from an order before it shipped, and their refund
 * - returns: received, refunded, or not accepted
 * - replacements: shipped and delivered
 * - the store's replies on support cases
 * - other shoppers' answers to the shopper's questions
 * - asking for a review of what arrived and hasn't been reviewed, a couple of days after delivery
 *
 * Only things that have happened, from the last 90 days. What came in since the shopper last opened
 * the page in that store is new (`inbox_reads`).
 */

export const INBOX_DAYS = 90;
export const INBOX_LIMIT = 100;

export type InboxKind =
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'items_cancelled'
  | 'items_refunded'
  | 'return_received'
  | 'return_refunded'
  | 'return_rejected'
  | 'replacement_shipped'
  | 'replacement_delivered'
  | 'support_reply'
  | 'answer'
  | 'review_request';

export interface InboxMessage {
  /** stable and unique: `<kind>:<id>` */
  key: string;
  kind: InboxKind;
  at: string;
  /** what it's about: the order's first item ("Kettle and 2 more"), the items cancelled or replaced, the case subject, or the question */
  subject: string;
  /** store-relative link to where it's dealt with */
  href: string;
  orderId?: string;
  /** refunds, in the store's currency */
  amountMinor?: number;
  /** why a return wasn't accepted, or the answer's text */
  detail?: string;
  /** answers: who wrote it */
  from?: string;
}

/** A return that has got somewhere (received or not accepted), or a replacement's (sent on request). */
export interface InboxReturn {
  id: string;
  orderId: string;
  status: 'requested' | 'received' | 'rejected';
  receivedAt: string | null;
  refundStatus: string | null;
  refundedAt: string | null;
  refundMinor: number;
  rejectedAt: string | null;
  rejectNote: string | null;
  /** a replacement: the products being sent again, and when they ship and arrive */
  replacement?: { productIds: string[]; shippedAt: string; deliveredAt: string };
  /** a "Package didn't arrive" claim: nothing came back, so only its refund is news */
  missing?: true;
}

/** One of the store's replies on the shopper's support case. */
export interface InboxReply {
  id: string;
  caseId: string;
  subject: string;
  at: string;
}

/** Someone else's answer to the shopper's question. */
export interface InboxAnswer {
  id: string;
  productId: string;
  question: string;
  author: string;
  body: string;
  at: string;
}

export interface InboxSources {
  orders: Order[];
  returns: InboxReturn[];
  replies: InboxReply[];
  answers: InboxAnswer[];
  /** delivered products not reviewed yet */
  toReview?: (Pick<ToReview, 'orderId' | 'deliveredAt'> & { product: Pick<ToReview['product'], 'id' | 'title'> })[];
}

/** How long after delivery the store asks for a review, as Amazon's "How was it?" does. */
export const REVIEW_REQUEST_DELAY_MS = 2 * 86_400_000;

/** "Kettle", "Kettle and 1 more", "Kettle and 2 more". */
export function orderSubject(o: { items: { title: string }[] }): string {
  const [first, ...rest] = o.items;
  if (!first) return 'Your order';
  return rest.length ? `${first.title} and ${rest.length} more` : first.title;
}

const MILESTONES: Record<string, InboxKind> = { Shipped: 'shipped', 'Out for delivery': 'out_for_delivery', Delivered: 'delivered' };

function orderMessages(o: Order, now: Date, timeZone: string): InboxMessage[] {
  const base = { subject: orderSubject(o), href: `/orders/${encodeURIComponent(o.id)}?placed=0`, orderId: o.id };
  const out: InboxMessage[] = [];
  if (o.status === 'placed') {
    for (const step of trackingSteps(o, now, timeZone)) {
      const kind = MILESTONES[step.label];
      if (kind && step.state !== 'upcoming') out.push({ ...base, key: `${kind}:${o.id}`, kind, at: step.at });
    }
  } else if (o.status === 'cancelled' && o.cancelledAt) {
    out.push({ ...base, key: `cancelled:${o.id}`, kind: 'cancelled', at: o.cancelledAt });
  }
  if (o.refund?.status === 'succeeded' && o.refund.amountMinor > 0 && o.refund.refundedAt) {
    out.push({ ...base, key: `refunded:${o.id}`, kind: 'refunded', at: o.refund.refundedAt, amountMinor: o.refund.amountMinor });
  }
  for (const c of o.cancellations ?? []) {
    const items = { ...base, subject: orderSubject(c) };
    out.push({ ...items, key: `items_cancelled:${c.id}`, kind: 'items_cancelled', at: c.createdAt });
    if (c.refund.status === 'succeeded' && c.refund.amountMinor > 0 && c.refund.refundedAt) {
      out.push({ ...items, key: `items_refunded:${c.id}`, kind: 'items_refunded', at: c.refund.refundedAt, amountMinor: c.refund.amountMinor });
    }
  }
  return out;
}

function returnMessages(r: InboxReturn, order: Order | undefined): InboxMessage[] {
  const subject = order ? orderSubject(order) : 'Your return';
  const base = { subject, href: `/orders/${encodeURIComponent(r.orderId)}?placed=0`, orderId: r.orderId };
  const out: InboxMessage[] = [];
  // a replacement goes out on request, whatever then happens to the item sent back
  if (r.replacement) {
    const ids = new Set(r.replacement.productIds);
    const items = order?.items.filter((i) => ids.has(i.productId)) ?? [];
    const swap = { ...base, subject: items.length ? orderSubject({ items }) : subject };
    out.push({ ...swap, key: `replacement_shipped:${r.id}`, kind: 'replacement_shipped', at: r.replacement.shippedAt });
    out.push({ ...swap, key: `replacement_delivered:${r.id}`, kind: 'replacement_delivered', at: r.replacement.deliveredAt });
  }
  if (r.status === 'rejected') {
    if (r.rejectedAt) out.push({ ...base, key: `return_rejected:${r.id}`, kind: 'return_rejected', at: r.rejectedAt, detail: r.rejectNote ?? undefined });
    return out;
  }
  if (r.receivedAt && !r.missing) out.push({ ...base, key: `return_received:${r.id}`, kind: 'return_received', at: r.receivedAt });
  if (r.refundStatus === 'succeeded' && r.refundedAt && r.refundMinor > 0) {
    out.push({ ...base, key: `return_refunded:${r.id}`, kind: r.missing ? 'refunded' : 'return_refunded', at: r.refundedAt, amountMinor: r.refundMinor });
  }
  return out;
}

/** Everything that's happened in the last 90 days, newest first, up to `INBOX_LIMIT`. */
export function buildInbox(src: InboxSources, now: Date = new Date(), timeZone = 'UTC'): InboxMessage[] {
  const byId = new Map(src.orders.map((o) => [o.id, o]));
  const all: InboxMessage[] = [
    ...src.orders.flatMap((o) => orderMessages(o, now, timeZone)),
    ...src.returns.flatMap((r) => returnMessages(r, byId.get(r.orderId))),
    ...src.replies.map((m): InboxMessage => ({
      key: `support_reply:${m.id}`,
      kind: 'support_reply',
      at: m.at,
      subject: m.subject,
      href: `/customer-service/cases/${encodeURIComponent(m.caseId)}`,
    })),
    ...(src.toReview ?? []).map((r): InboxMessage => ({
      key: `review_request:${r.product.id}`,
      kind: 'review_request',
      at: new Date(Date.parse(r.deliveredAt) + REVIEW_REQUEST_DELAY_MS).toISOString(),
      subject: r.product.title,
      href: `/product/${encodeURIComponent(r.product.id)}#write-review`,
      orderId: r.orderId,
    })),
    ...src.answers.map((a): InboxMessage => ({
      key: `answer:${a.id}`,
      kind: 'answer',
      at: a.at,
      subject: a.question,
      href: `/product/${encodeURIComponent(a.productId)}#questions`,
      detail: a.body,
      from: a.author,
    })),
  ];
  const t = now.getTime();
  const since = t - INBOX_DAYS * 86_400_000;
  return all
    .filter((m) => {
      const at = Date.parse(m.at);
      return at <= t && at > since;
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.key.localeCompare(b.key))
    .slice(0, INBOX_LIMIT);
}

type ReturnRow = {
  id: string;
  order_id: string;
  status: string;
  received_at: string | null;
  refund_status: string | null;
  refunded_at: string | null;
  refund_minor: number;
  rejected_at: string | null;
  reject_note: string | null;
  reason: string;
  resolution: string;
  return_items: { product_id: string }[];
  replacement_shipped_at: string | null;
  replacement_delivered_at: string | null;
};

async function inboxReturns(db: Db, market: Market, userId: string): Promise<InboxReturn[]> {
  const rows = unwrap(
    await db
      .from('returns')
      .select(
        'id, order_id, status, received_at, refund_status, refunded_at, refund_minor, rejected_at, reject_note, reason, resolution, replacement_shipped_at, replacement_delivered_at, return_items(product_id), orders!inner(market_id)',
      )
      .eq('user_id', userId)
      .eq('orders.market_id', market)
      // replacements ship as soon as they're asked for; other returns have nothing to say until they arrive
      .or('status.in.(received,rejected),and(status.eq.requested,resolution.eq.replacement)')
      .order('created_at', { ascending: false })
      .limit(INBOX_LIMIT),
  ) as unknown as ReturnRow[];
  return rows.map((r) => ({
    id: r.id,
    orderId: r.order_id,
    status: r.status === 'rejected' || r.status === 'requested' ? r.status : 'received',
    receivedAt: r.received_at,
    refundStatus: r.refund_status,
    refundedAt: r.refunded_at,
    refundMinor: r.refund_minor,
    rejectedAt: r.rejected_at,
    rejectNote: r.reject_note,
    ...(r.reason === 'not_received' ? { missing: true as const } : {}),
    ...(r.resolution === 'replacement' && r.replacement_shipped_at && r.replacement_delivered_at
      ? { replacement: { productIds: r.return_items.map((i) => i.product_id), shippedAt: r.replacement_shipped_at, deliveredAt: r.replacement_delivered_at } }
      : {}),
  }));
}

type ReplyRow = { id: string; case_id: string; created_at: string; support_cases: { subject: string } };

async function inboxReplies(db: Db, market: Market, userId: string, since: string): Promise<InboxReply[]> {
  const rows = unwrap(
    await db
      .from('support_messages')
      .select('id, case_id, created_at, support_cases!inner(subject, market_id, user_id)')
      .eq('author', 'agent')
      .eq('support_cases.market_id', market)
      .eq('support_cases.user_id', userId)
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(INBOX_LIMIT),
  ) as unknown as ReplyRow[];
  return rows.map((r) => ({ id: r.id, caseId: r.case_id, subject: r.support_cases.subject, at: r.created_at }));
}

async function inboxAnswers(db: Db, market: Market, userId: string, since: string): Promise<InboxAnswer[]> {
  const questions = unwrap(
    await db
      .from('product_questions')
      .select('id, product_id, body, products!inner(market_id)')
      .eq('user_id', userId)
      .eq('products.market_id', market)
      .gt('answer_count', 0)
      .order('created_at', { ascending: false })
      .limit(200),
  );
  if (!questions.length) return [];
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answers = unwrap(
    await db
      .from('product_answers')
      .select('id, question_id, user_id, author_name, body, created_at')
      .in('question_id', [...byId.keys()])
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(INBOX_LIMIT),
  );
  return answers.flatMap((a) => {
    const q = byId.get(a.question_id);
    if (!q || a.user_id === userId) return [];
    return [{ id: a.id, productId: q.product_id, question: q.body, author: a.author_name, body: a.body, at: a.created_at }];
  });
}

/** When the caller last opened their messages in this store; null if never (everything is new). */
export async function inboxSeenAt(db: Db, market: Market): Promise<string | null> {
  const { data, error } = await db.from('inbox_reads').select('seen_at').eq('market_id', market).maybeSingle();
  return error || !data ? null : data.seen_at;
}

/** Record that the caller has opened their messages in this store. */
export async function markInboxSeen(db: Db, market: Market): Promise<void> {
  const { error } = await db.rpc('mark_inbox_seen', { p_market: market });
  if (error) console.error('[inbox] mark seen failed', market, error.message);
}

/** Whether a message came in after the shopper last looked. */
export function isNewMessage(m: Pick<InboxMessage, 'at'>, seenAt: string | null): boolean {
  return !seenAt || Date.parse(m.at) > Date.parse(seenAt);
}

/** The caller's messages in a store, newest first. */
export async function listInbox(db: Db, market: Market, userId: string, now: Date = new Date(), timeZone = 'UTC'): Promise<InboxMessage[]> {
  const since = new Date(now.getTime() - INBOX_DAYS * 86_400_000).toISOString();
  const [orders, returns, replies, answers, toReview] = await Promise.all([
    listOrders(db, market, { limit: INBOX_LIMIT }),
    inboxReturns(db, market, userId),
    inboxReplies(db, market, userId, since),
    inboxAnswers(db, market, userId, since),
    awaitingReview(db, market, userId, now),
  ]);
  return buildInbox({ orders, returns, replies, answers, toReview }, now, timeZone);
}
