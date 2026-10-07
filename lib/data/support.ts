import type { Db } from '../db/client';
import type { Market } from '../types';
import { DataError, unwrap } from './errors';

/**
 * Customer service cases ("Contact us"): a shopper opens a case in a store, optionally about one
 * of their orders, and the store's admins answer in the same thread until either side closes it.
 * Writes go through open_support_case / reply_support_case / close_support_case
 * (20261031090000_support_cases.sql); reads lean on RLS (your own cases, or any as an admin).
 * A case has a new reply for its shopper while the store has written since they last opened it
 * (20261102090000_support_seen.sql).
 */

export const SUPPORT_TOPICS = ['order', 'delivery', 'return', 'payment', 'account', 'other'] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

export const TOPIC_LABELS: Record<SupportTopic, string> = {
  order: 'An order',
  delivery: 'Delivery',
  return: 'Returns & refunds',
  payment: 'Payments & gift cards',
  account: 'Your account',
  other: 'Something else',
};

/** `open`: waiting on the store · `answered`: the store replied last · `closed`: read only. */
export type SupportStatus = 'open' | 'answered' | 'closed';

/** Cases a shopper can have waiting or answered per store at once. */
export const OPEN_CASE_LIMIT = 5;
export const SUBJECT_MAX = 120;
export const MESSAGE_MAX = 2000;

export interface SupportCase {
  id: string;
  topic: SupportTopic;
  subject: string;
  status: SupportStatus;
  orderId: string | null;
  customer: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface SupportMessage {
  id: string;
  /** `agent`: someone at the store */
  from: 'customer' | 'agent';
  body: string;
  createdAt: string;
}

export interface SupportThread extends SupportCase {
  messages: SupportMessage[];
}

export function supportTopic(v: unknown): SupportTopic | null {
  return (SUPPORT_TOPICS as readonly unknown[]).includes(v) ? (v as SupportTopic) : null;
}

type Row = Record<string, unknown>;

const CASE_COLS = 'id, topic, subject, status, order_id, customer_name, created_at, updated_at, closed_at';
const MESSAGE_COLS = 'id, author, body, created_at';

function toCase(r: Row): SupportCase {
  return {
    id: String(r.id),
    topic: supportTopic(r.topic) ?? 'other',
    subject: String(r.subject ?? ''),
    status: (['open', 'answered', 'closed'].includes(String(r.status)) ? r.status : 'open') as SupportStatus,
    orderId: r.order_id == null ? null : String(r.order_id),
    customer: String(r.customer_name ?? ''),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    closedAt: r.closed_at == null ? null : String(r.closed_at),
  };
}

function toMessage(r: Row): SupportMessage {
  return { id: String(r.id), from: r.author === 'agent' ? 'agent' : 'customer', body: String(r.body ?? ''), createdAt: String(r.created_at) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface NewCase {
  topic?: unknown;
  subject?: unknown;
  body?: unknown;
  orderId?: unknown;
}

/** Open a case in `market` with its first message (10–2,000 characters). */
export async function openCase(db: Db, market: Market, input: NewCase): Promise<SupportCase> {
  const topic = supportTopic(input.topic);
  if (!topic) throw new DataError('invalid_input', 'topic', 'Choose what your question is about.');
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (subject.length < 3 || subject.length > SUBJECT_MAX) throw new DataError('invalid_input', 'subject', `Add a subject of 3 to ${SUBJECT_MAX} characters.`);
  if (body.length < 10 || body.length > MESSAGE_MAX) throw new DataError('invalid_input', 'body', 'Tell us a little more: at least 10 characters, up to 2,000.');
  const orderId = typeof input.orderId === 'string' && input.orderId.trim() ? input.orderId.trim() : undefined;
  const json = unwrap(
    await db.rpc('open_support_case', { p_market: market, p_topic: topic, p_subject: subject, p_body: body, p_order: orderId }),
  ) as Row;
  return toCase(json);
}

/** Reply on a case (2–2,000 characters): the shopper on their own, an admin on any. */
export async function replyToCase(db: Db, caseId: string, body: unknown): Promise<SupportMessage> {
  if (!UUID.test(caseId)) throw new DataError('case_not_found');
  const text = typeof body === 'string' ? body.trim() : '';
  if (text.length < 2 || text.length > MESSAGE_MAX) throw new DataError('invalid_input', 'body', 'Write a reply of up to 2,000 characters.');
  return toMessage(unwrap(await db.rpc('reply_support_case', { p_case: caseId, p_body: text })) as Row);
}

/** Close a case (yours, or any as an admin); closing it twice is fine. */
export async function closeCase(db: Db, caseId: string): Promise<SupportCase> {
  if (!UUID.test(caseId)) throw new DataError('case_not_found');
  return toCase(unwrap(await db.rpc('close_support_case', { p_case: caseId })) as Row);
}

/** The caller's cases in a store: waiting on the store or answered first, then closed; latest activity first. */
export async function listMyCases(db: Db, market: Market, userId: string): Promise<SupportCase[]> {
  const rows = unwrap(
    await db
      .from('support_cases')
      .select(CASE_COLS)
      .eq('user_id', userId)
      .eq('market_id', market)
      .order('updated_at', { ascending: false })
      .limit(100),
  ) as unknown as Row[];
  const cases = rows.map(toCase);
  return [...cases.filter((c) => c.status !== 'closed'), ...cases.filter((c) => c.status === 'closed')];
}

/**
 * Ids of the caller's cases in a store with a store reply they haven't seen yet. Never throws: a
 * failed read (or a database before the support_seen migration) shows no new replies.
 */
export async function unreadCaseIds(db: Db, market: Market): Promise<Set<string>> {
  const { data, error } = await db.rpc('my_unread_support_cases', { p_market: market });
  if (error || !Array.isArray(data)) return new Set();
  return new Set(data.map(String));
}

/** The shopper has read their case, so its replies so far aren't new. Best-effort: never throws. */
export async function markCaseSeen(db: Db, caseId: string): Promise<void> {
  if (!UUID.test(caseId)) return;
  const { error } = await db.rpc('mark_support_case_seen', { p_case: caseId });
  if (error) console.error('[support] mark seen failed', caseId, error.message);
}

/**
 * One case in a store with its messages, oldest first, or null. RLS decides who sees it: its
 * shopper or an admin; `userId` narrows it to the shopper's own (an admin's own pages pass null).
 */
export async function getCase(db: Db, market: Market, caseId: string, userId: string | null): Promise<SupportThread | null> {
  if (!UUID.test(caseId)) return null;
  let q = db.from('support_cases').select(CASE_COLS).eq('id', caseId).eq('market_id', market);
  if (userId) q = q.eq('user_id', userId);
  const row = unwrap(await q.maybeSingle()) as Row | null;
  if (!row) return null;
  const messages = unwrap(
    await db.from('support_messages').select(MESSAGE_COLS).eq('case_id', caseId).order('created_at').order('id'),
  ) as unknown as Row[];
  return { ...toCase(row), messages: messages.map(toMessage) };
}

// ── admin queue (/admin/support) ─────────────────────────────────────────────

export type CaseQueueView = 'waiting' | 'answered' | 'closed';
export const CASE_QUEUE_VIEWS: readonly CaseQueueView[] = ['waiting', 'answered', 'closed'];
export const CASE_QUEUE_PAGE_SIZE = 25;

const VIEW_STATUS: Record<CaseQueueView, SupportStatus> = { waiting: 'open', answered: 'answered', closed: 'closed' };

export function caseView(v: unknown): CaseQueueView {
  return (CASE_QUEUE_VIEWS as readonly unknown[]).includes(v) ? (v as CaseQueueView) : 'waiting';
}

export interface QueuedCase extends SupportCase {
  /** the latest message, for a preview */
  last: SupportMessage | null;
  messageCount: number;
}

export interface CaseQueuePage {
  cases: QueuedCase[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<CaseQueueView, number>;
}

/**
 * One page of a store's cases in a view. Waiting cases come longest-waiting first (the next one
 * to answer at the top); answered and closed ones latest first.
 */
export async function listCaseQueue(db: Db, market: Market, opts: { view?: CaseQueueView; page?: number } = {}): Promise<CaseQueuePage> {
  const view = opts.view ?? 'waiting';
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const from = (page - 1) * CASE_QUEUE_PAGE_SIZE;
  const count = (v: CaseQueueView) =>
    db.from('support_cases').select('id', { count: 'exact', head: true }).eq('market_id', market).eq('status', VIEW_STATUS[v]);
  const [res, waiting, answered, closed] = await Promise.all([
    db
      .from('support_cases')
      .select(CASE_COLS, { count: 'exact' })
      .eq('market_id', market)
      .eq('status', VIEW_STATUS[view])
      .order('updated_at', { ascending: view === 'waiting' })
      .order('id')
      .range(from, from + CASE_QUEUE_PAGE_SIZE - 1),
    count('waiting'),
    count('answered'),
    count('closed'),
  ]);
  const rows = (unwrap(res) ?? []) as unknown as Row[];
  const byCase = new Map<string, SupportMessage[]>();
  if (rows.length) {
    const messages = unwrap(
      await db
        .from('support_messages')
        .select(`case_id, ${MESSAGE_COLS}`)
        .in('case_id', rows.map((r) => String(r.id)))
        .order('created_at')
        .order('id'),
    ) as unknown as Row[];
    for (const m of messages) {
      const list = byCase.get(String(m.case_id)) ?? [];
      list.push(toMessage(m));
      byCase.set(String(m.case_id), list);
    }
  }
  return {
    cases: rows.map((r) => {
      const messages = byCase.get(String(r.id)) ?? [];
      return { ...toCase(r), last: messages[messages.length - 1] ?? null, messageCount: messages.length };
    }),
    total: res.count ?? rows.length,
    page,
    pageSize: CASE_QUEUE_PAGE_SIZE,
    counts: { waiting: waiting.count ?? 0, answered: answered.count ?? 0, closed: closed.count ?? 0 },
  };
}

/** Whether a case belongs to `market` (admin pages are per store). */
export async function assertStoreCase(db: Db, market: Market, id: string): Promise<void> {
  if (!UUID.test(id)) throw new DataError('case_not_found');
  const row = unwrap(await db.from('support_cases').select('id').eq('id', id).eq('market_id', market).maybeSingle());
  if (!row) throw new DataError('case_not_found');
}

/** An order the shopper can pick on "Contact us". */
export interface CaseOrder {
  id: string;
  placedAt: string;
  /** "Desk Lamp and 2 more" */
  summary: string;
}

/** The caller's latest placed orders in a store, newest first, to ask about. */
export async function listCaseOrders(db: Db, market: Market, userId: string, limit = 20): Promise<CaseOrder[]> {
  const rows = unwrap(
    await db
      .from('orders')
      .select('id, placed_at, created_at, order_items(title)')
      .eq('user_id', userId)
      .eq('market_id', market)
      .not('placed_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit),
  ) as unknown as { id: string; placed_at: string | null; created_at: string; order_items: { title: string }[] }[];
  return rows.map((o) => {
    const [first, ...rest] = o.order_items.map((i) => i.title);
    return {
      id: o.id,
      placedAt: o.placed_at ?? o.created_at,
      summary: first ? (rest.length ? `${first} and ${rest.length} more` : first) : 'Order',
    };
  });
}
