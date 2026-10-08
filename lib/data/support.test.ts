import { expect, it, vi } from 'vitest';
import type { Db } from '../db/client';
import {
  assertStoreCase,
  caseView,
  closeCase,
  getCase,
  isStoreSeller,
  listCaseOrders,
  listCaseQueue,
  listMyCases,
  markCaseSeen,
  openCase,
  replyToCase,
  supportTopic,
  unreadCaseIds,
} from './support';

type Reply = { data: unknown; error: unknown; count?: number | null };

/** A client whose reads answer from a queue of replies per table (and per RPC), recording each call. */
function fakeDb(replies: Record<string, Reply[]>) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const db = {
    from: (table: string) => {
      const call = { table, ops: [] as [string, unknown[]][] };
      calls.push(call);
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'not', 'order', 'range', 'limit', 'maybeSingle']) {
        q[m] = (...args: unknown[]) => {
          call.ops.push([m, args]);
          return q;
        };
      }
      q.then = (resolve: (r: Reply) => unknown) => resolve(replies[table]?.shift() ?? { data: [], error: null });
      return q;
    },
    rpc: async (fn: string, args: unknown) => {
      calls.push({ table: `rpc:${fn}`, ops: [['args', [args]]] });
      return replies[`rpc:${fn}`]?.shift() ?? { data: null, error: null };
    },
  };
  return { db: db as unknown as Db, calls };
}

const ID = '00000000-0000-4000-8000-000000000001';

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, topic: 'delivery', subject: `Case ${id}`, status: 'open', order_id: null, customer_name: 'Asha',
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z', closed_at: null, ...over,
});

const msg = (id: string, caseId: string, author: string, at: string) => ({ id, case_id: caseId, author, body: `Message ${id}`, created_at: at });

it('reads topics and queue views', () => {
  expect(supportTopic('return')).toBe('return');
  expect(supportTopic('refund')).toBeNull();
  expect(caseView('closed')).toBe('closed');
  expect(caseView('everything')).toBe('waiting');
});

it('checks a new case before calling the RPC', async () => {
  const { db, calls } = fakeDb({ 'rpc:open_support_case': [{ data: row(ID, { order_id: 'ORD-1' }), error: null }] });
  await expect(openCase(db, 'US', { topic: 'refund', subject: 'Hello', body: 'Long enough body' })).rejects.toMatchObject({ code: 'invalid_input', detail: 'topic' });
  await expect(openCase(db, 'US', { topic: 'order', subject: ' a ', body: 'Long enough body' })).rejects.toMatchObject({ detail: 'subject' });
  await expect(openCase(db, 'US', { topic: 'order', subject: 'x'.repeat(121), body: 'Long enough body' })).rejects.toMatchObject({ detail: 'subject' });
  await expect(openCase(db, 'US', { topic: 'order', subject: 'Late parcel', body: 'too short' })).rejects.toMatchObject({ detail: 'body' });
  expect(calls).toEqual([]);

  const opened = await openCase(db, 'US', { topic: 'order', subject: '  Late parcel ', body: ' It has not come yet. ', orderId: ' ORD-1 ' });
  expect(opened).toMatchObject({ id: ID, topic: 'delivery', orderId: 'ORD-1', customer: 'Asha', status: 'open' });
  expect(calls[0].ops[0][1][0]).toEqual({ p_market: 'US', p_topic: 'order', p_subject: 'Late parcel', p_body: 'It has not come yet.', p_order: 'ORD-1' });
});

it('leaves the order out of a case that isn’t about one', async () => {
  const { db, calls } = fakeDb({ 'rpc:open_support_case': [{ data: row(ID), error: null }] });
  await openCase(db, 'IN', { topic: 'account', subject: 'Email change', body: 'How do I change my email?', orderId: '  ' });
  expect((calls[0].ops[0][1][0] as Record<string, unknown>).p_order).toBeUndefined();
});

it('passes the RPC’s errors through', async () => {
  const { db } = fakeDb({ 'rpc:open_support_case': [{ data: null, error: { message: 'too_many_cases', code: 'P0001' } }] });
  await expect(openCase(db, 'US', { topic: 'other', subject: 'Sixth one', body: 'Yet another question' })).rejects.toMatchObject({ code: 'too_many_cases' });
});

it('sends a case with a seller to contact_seller, and reads the seller back', async () => {
  const { db, calls } = fakeDb({ 'rpc:contact_seller': [{ data: row(ID, { order_id: 'ORD-1', seller: 'Acme Goods' }), error: null }] });
  const opened = await openCase(db, 'IN', { topic: 'return', subject: 'Missing part', body: 'The lid was not in the box.', orderId: 'ORD-1', seller: '  Acme Goods ' });
  expect(opened).toMatchObject({ id: ID, orderId: 'ORD-1', seller: 'Acme Goods' });
  expect(calls).toEqual([
    { table: 'rpc:contact_seller', ops: [['args', [{ p_market: 'IN', p_seller: 'Acme Goods', p_topic: 'return', p_subject: 'Missing part', p_body: 'The lid was not in the box.', p_order: 'ORD-1' }]]] },
  ]);
});

it('opens a store case when the seller is blank, and has no seller on it', async () => {
  const { db, calls } = fakeDb({ 'rpc:open_support_case': [{ data: row(ID, { seller: null }), error: null }] });
  const opened = await openCase(db, 'US', { topic: 'other', subject: 'A question', body: 'Asking the store a question.', seller: '   ' });
  expect(opened.seller).toBeUndefined();
  expect(calls[0].table).toBe('rpc:open_support_case');
});

it('passes contact_seller’s errors through', async () => {
  const { db } = fakeDb({
    'rpc:contact_seller': [
      { data: null, error: { message: 'seller_not_found', code: 'P0002' } },
      { data: null, error: { message: 'order_not_found', details: 'seller', code: 'P0002' } },
    ],
  });
  const ask = { topic: 'order', subject: 'A question', body: 'Asking the seller a question.', seller: 'Nobody' };
  await expect(openCase(db, 'US', ask)).rejects.toMatchObject({ code: 'seller_not_found' });
  await expect(openCase(db, 'US', { ...ask, orderId: 'ORD-9' })).rejects.toMatchObject({ code: 'order_not_found', detail: 'seller' });
});

it('checks replies and closes before calling the RPC', async () => {
  const { db, calls } = fakeDb({
    'rpc:reply_support_case': [{ data: msg('m1', ID, 'agent', '2026-10-03T00:00:00Z'), error: null }],
    'rpc:close_support_case': [{ data: row(ID, { status: 'closed', closed_at: '2026-10-04T00:00:00Z' }), error: null }],
  });
  await expect(replyToCase(db, 'nope', 'Hello there')).rejects.toMatchObject({ code: 'case_not_found' });
  await expect(replyToCase(db, ID, ' x ')).rejects.toMatchObject({ code: 'invalid_input', detail: 'body' });
  await expect(replyToCase(db, ID, 'y'.repeat(2001))).rejects.toMatchObject({ detail: 'body' });
  await expect(closeCase(db, 'nope')).rejects.toMatchObject({ code: 'case_not_found' });
  expect(calls).toEqual([]);

  expect(await replyToCase(db, ID, ' On its way. ')).toEqual({ id: 'm1', from: 'agent', body: 'Message m1', createdAt: '2026-10-03T00:00:00Z' });
  expect(calls[0].ops[0][1][0]).toEqual({ p_case: ID, p_body: 'On its way.' });
  expect(await closeCase(db, ID)).toMatchObject({ status: 'closed', closedAt: '2026-10-04T00:00:00Z' });
});

it('lists a shopper’s cases with the closed ones last', async () => {
  const { db, calls } = fakeDb({
    support_cases: [{ data: [row('c1', { status: 'closed' }), row('c2', { status: 'answered' }), row('c3')], error: null }],
  });
  expect((await listMyCases(db, 'IN', 'u1')).map((c) => [c.id, c.status])).toEqual([
    ['c2', 'answered'],
    ['c3', 'open'],
    ['c1', 'closed'],
  ]);
  expect(calls[0].ops).toContainEqual(['eq', ['user_id', 'u1']]);
  expect(calls[0].ops).toContainEqual(['eq', ['market_id', 'IN']]);
});

it('reads one case with its messages, narrowed to the shopper when given', async () => {
  const { db, calls } = fakeDb({
    support_cases: [{ data: row(ID), error: null }, { data: null, error: null }],
    support_messages: [{ data: [msg('m1', ID, 'customer', '2026-10-01T00:00:00Z'), msg('m2', ID, 'agent', '2026-10-02T00:00:00Z')], error: null }],
  });
  expect(await getCase(db, 'US', 'not-a-uuid', 'u1')).toBeNull();
  expect(calls).toEqual([]);

  const thread = await getCase(db, 'US', ID, 'u1');
  expect(thread?.messages.map((m) => [m.id, m.from])).toEqual([
    ['m1', 'customer'],
    ['m2', 'agent'],
  ]);
  expect(calls[0].ops).toContainEqual(['eq', ['user_id', 'u1']]);
  expect(calls[1].ops).toContainEqual(['eq', ['case_id', ID]]);

  // an admin's read isn't narrowed; a missing case skips the messages
  expect(await getCase(db, 'US', ID, null)).toBeNull();
  expect(calls[2].ops).not.toContainEqual(['eq', ['user_id', expect.anything()]]);
  expect(calls).toHaveLength(3);
});

it('queues waiting cases longest-waiting first with every view’s count and the latest message', async () => {
  const { db, calls } = fakeDb({
    support_cases: [
      { data: [row('c1'), row('c2')], error: null, count: 27 },
      { data: null, error: null, count: 27 },
      { data: null, error: null, count: 4 },
      { data: null, error: null, count: 9 },
    ],
    support_messages: [
      {
        data: [msg('m1', 'c1', 'customer', '2026-10-01T00:00:00Z'), msg('m2', 'c1', 'agent', '2026-10-02T00:00:00Z'), msg('m3', 'c1', 'customer', '2026-10-03T00:00:00Z')],
        error: null,
      },
    ],
  });
  const page = await listCaseQueue(db, 'US', { page: 2 });
  expect(page).toMatchObject({ total: 27, page: 2, pageSize: 25, counts: { waiting: 27, answered: 4, closed: 9 } });
  expect(page.cases.map((c) => [c.id, c.last?.id ?? null, c.messageCount])).toEqual([
    ['c1', 'm3', 3],
    ['c2', null, 0],
  ]);
  const [list, waiting, answered, closed, messages] = calls;
  expect(list.ops).toContainEqual(['eq', ['status', 'open']]);
  expect(list.ops).toContainEqual(['order', ['updated_at', { ascending: true }]]);
  expect(list.ops).toContainEqual(['range', [25, 49]]);
  expect(waiting.ops).toContainEqual(['eq', ['status', 'open']]);
  expect(answered.ops).toContainEqual(['eq', ['status', 'answered']]);
  expect(closed.ops).toContainEqual(['eq', ['status', 'closed']]);
  expect(messages.ops).toContainEqual(['in', ['case_id', ['c1', 'c2']]]);
});

it('queues answered and closed cases latest first, and skips the message lookup when empty', async () => {
  const { db, calls } = fakeDb({ support_cases: [{ data: [], error: null, count: 0 }] });
  const page = await listCaseQueue(db, 'IN', { view: 'closed' });
  expect(page.cases).toEqual([]);
  expect(calls[0].ops).toContainEqual(['eq', ['status', 'closed']]);
  expect(calls[0].ops).toContainEqual(['order', ['updated_at', { ascending: false }]]);
  expect(calls.map((c) => c.table)).toEqual(['support_cases', 'support_cases', 'support_cases', 'support_cases']);
});

it('scopes admin writes to the store', async () => {
  const { db, calls } = fakeDb({ support_cases: [{ data: null, error: null }, { data: { id: ID }, error: null }] });
  await expect(assertStoreCase(db, 'US', 'not-a-uuid')).rejects.toMatchObject({ code: 'case_not_found' });
  await expect(assertStoreCase(db, 'US', ID)).rejects.toMatchObject({ code: 'case_not_found' });
  await expect(assertStoreCase(db, 'US', ID)).resolves.toBeUndefined();
  expect(calls[0].ops).toContainEqual(['eq', ['market_id', 'US']]);
});

it('summarises the shopper’s orders to pick from', async () => {
  const { db, calls } = fakeDb({
    orders: [
      {
        data: [
          { id: 'ORD-2', placed_at: '2026-10-02T00:00:00Z', created_at: '2026-10-02T00:00:00Z', order_items: [{ title: 'Desk Lamp' }, { title: 'Bulb' }, { title: 'Cable' }] },
          { id: 'ORD-1', placed_at: null, created_at: '2026-10-01T00:00:00Z', order_items: [{ title: 'Kettle' }] },
          { id: 'ORD-0', placed_at: '2026-09-01T00:00:00Z', created_at: '2026-09-01T00:00:00Z', order_items: [] },
        ],
        error: null,
      },
    ],
  });
  expect(await listCaseOrders(db, 'US', 'u1')).toEqual([
    { id: 'ORD-2', placedAt: '2026-10-02T00:00:00Z', summary: 'Desk Lamp and 2 more' },
    { id: 'ORD-1', placedAt: '2026-10-01T00:00:00Z', summary: 'Kettle' },
    { id: 'ORD-0', placedAt: '2026-09-01T00:00:00Z', summary: 'Order' },
  ]);
  // admins can read every order: the list names the shopper rather than leaning on RLS
  expect(calls[0].ops).toContainEqual(['eq', ['user_id', 'u1']]);
  expect(calls[0].ops).toContainEqual(['not', ['placed_at', 'is', null]]);
});

it('lists only the orders with a seller’s items, summed up by those items', async () => {
  const { db, calls } = fakeDb({
    orders: [{ data: [{ id: 'ORD-2', placed_at: '2026-10-02T00:00:00Z', created_at: '2026-10-02T00:00:00Z', order_items: [{ title: 'Desk Lamp' }] }], error: null }],
  });
  expect(await listCaseOrders(db, 'US', 'u1', 20, 'Acme Goods')).toEqual([{ id: 'ORD-2', placedAt: '2026-10-02T00:00:00Z', summary: 'Desk Lamp' }]);
  expect(calls[0].ops).toContainEqual(['select', ['id, placed_at, created_at, order_items!inner(title)']]);
  expect(calls[0].ops).toContainEqual(['eq', ['order_items.seller', 'Acme Goods']]);
});

it('knows who sells in a store, and no one for a blank name or a failed read', async () => {
  const { db, calls } = fakeDb({ products: [{ data: [{ id: 'p1' }], error: null }, { data: [], error: null }, { data: null, error: { message: 'boom' } }] });
  expect(await isStoreSeller(db, 'IN', 'Acme Goods')).toBe(true);
  expect(calls[0].ops).toEqual([['select', ['id']], ['eq', ['market_id', 'IN']], ['eq', ['seller', 'Acme Goods']], ['limit', [1]]]);
  expect(await isStoreSeller(db, 'IN', 'Nobody')).toBe(false);
  expect(await isStoreSeller(db, 'IN', 'Acme Goods')).toBe(false);
  expect(await isStoreSeller(db, 'IN', '  ')).toBe(false);
  expect(calls).toHaveLength(3);
});

it('reads which cases have a new reply, and none when that fails', async () => {
  const { db, calls } = fakeDb({ 'rpc:my_unread_support_cases': [{ data: [ID, 'c2'], error: null }, { data: null, error: { code: 'PGRST202', message: 'missing' } }] });
  expect(await unreadCaseIds(db, 'IN')).toEqual(new Set([ID, 'c2']));
  expect(calls[0]).toEqual({ table: 'rpc:my_unread_support_cases', ops: [['args', [{ p_market: 'IN' }]]] });
  expect(await unreadCaseIds(db, 'IN')).toEqual(new Set());
});

it('marks a case seen, skipping a malformed id and never throwing', async () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { db, calls } = fakeDb({ 'rpc:mark_support_case_seen': [{ data: null, error: null }, { data: null, error: { code: '42501', message: 'denied' } }] });
  await markCaseSeen(db, 'not-a-case');
  expect(calls).toEqual([]);
  await markCaseSeen(db, ID);
  await expect(markCaseSeen(db, ID)).resolves.toBeUndefined();
  expect(calls.map((c) => c.ops[0][1][0])).toEqual([{ p_case: ID }, { p_case: ID }]);
  expect(err).toHaveBeenCalledTimes(1);
  err.mockRestore();
});
