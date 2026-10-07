import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataError } from '@/lib/data/errors';
import { placeOrder } from '@/lib/data/orders';
import { assertStoreCase, closeCase, getCase, listCaseOrders, listCaseQueue, listMyCases, openCase, replyToCase } from '@/lib/data/support';
import { admin, anon, deleteUser, IN_SHIPPING, newUser, pickProduct, type TestUser } from './helpers';

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
  return 'no error';
};

describe('support cases', () => {
  let shopper: TestUser;
  let other: TestUser;
  let agent: TestUser;
  let orderId: string;
  let otherOrderId: string;
  beforeAll(async () => {
    [shopper, other, agent] = await Promise.all([newUser('Case Opener'), newUser('Case Bystander'), newUser('Support Agent')]);
    const { error } = await admin().from('admins').insert({ user_id: agent.id });
    if (error) throw error;
    const [mine, theirs] = await Promise.all([pickProduct('IN', 43), pickProduct('IN', 44)]);
    [orderId, otherOrderId] = (
      await Promise.all([
        placeOrder(shopper.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId: mine.id, qty: 1 } }),
        placeOrder(other.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId: theirs.id, qty: 1 } }),
      ])
    ).map((o) => o.id);
  });
  afterAll(async () => {
    await admin().from('support_cases').delete().in('user_id', [shopper.id, other.id]);
    await admin().from('admins').delete().eq('user_id', agent.id);
    await Promise.all([shopper, other, agent].map(deleteUser));
  });

  it('opens a case about one of your orders, and only yours', async () => {
    const opened = await openCase(shopper.db, 'IN', { topic: 'delivery', subject: '  Parcel never came  ', body: 'Tracking says delivered, but nothing came.', orderId });
    expect(opened).toMatchObject({ topic: 'delivery', subject: 'Parcel never came', status: 'open', orderId, customer: 'Case Opener', closedAt: null });

    const thread = await getCase(shopper.db, 'IN', opened.id, shopper.id);
    expect(thread?.messages.map((m) => [m.from, m.body])).toEqual([['customer', 'Tracking says delivered, but nothing came.']]);
    expect((await listCaseOrders(shopper.db, 'IN', shopper.id)).map((o) => o.id)).toContain(orderId);

    // someone else's order, or yours in the other store, isn't one to ask about
    expect(await failure(openCase(shopper.db, 'IN', { topic: 'order', subject: 'Not mine', body: 'Asking about another order.', orderId: otherOrderId }))).toBe('order_not_found:');
    expect(await failure(openCase(shopper.db, 'US', { topic: 'order', subject: 'Wrong store', body: 'Asking in the other store.', orderId }))).toBe('order_not_found:');

    // the database checks what the app checks
    const raw = await shopper.db.rpc('open_support_case', { p_market: 'IN', p_topic: 'refund', p_subject: 'Hello', p_body: 'Long enough body' });
    expect([raw.error?.message, raw.error?.details]).toEqual(['invalid_input', 'topic']);
    const multiline = await shopper.db.rpc('open_support_case', { p_market: 'IN', p_topic: 'other', p_subject: 'Two\nlines', p_body: 'Long enough body' });
    expect(multiline.error?.details).toBe('subject');
    const short = await shopper.db.rpc('open_support_case', { p_market: 'IN', p_topic: 'other', p_subject: 'Hello', p_body: 'short' });
    expect(short.error?.details).toBe('body');
  });

  it('goes back and forth between the shopper and the store', async () => {
    const [opened] = await listMyCases(shopper.db, 'IN', shopper.id);
    expect((await listCaseQueue(agent.db, 'IN')).cases.map((c) => c.id)).toContain(opened.id);
    await assertStoreCase(agent.db, 'IN', opened.id);
    expect(await failure(assertStoreCase(agent.db, 'US', opened.id))).toBe('case_not_found:');

    const answer = await replyToCase(agent.db, opened.id, 'Sorry about that. We have asked the carrier.');
    expect(answer.from).toBe('agent');
    expect((await getCase(shopper.db, 'IN', opened.id, shopper.id))?.status).toBe('answered');
    const answered = await listCaseQueue(agent.db, 'IN', { view: 'answered' });
    const row = answered.cases.find((c) => c.id === opened.id)!;
    expect(row).toMatchObject({ messageCount: 2, last: { id: answer.id, from: 'agent' } });
    expect(answered.counts.answered).toBe(answered.total);

    const back = await replyToCase(shopper.db, opened.id, 'Thanks, any news?');
    expect(back.from).toBe('customer');
    const thread = (await getCase(agent.db, 'IN', opened.id, null))!;
    expect(thread.status).toBe('open');
    expect(thread.messages.map((m) => m.from)).toEqual(['customer', 'agent', 'customer']);
    expect(Date.parse(thread.updatedAt)).toBe(Date.parse(back.createdAt));
  });

  it('keeps cases private to their shopper', async () => {
    const [opened] = await listMyCases(shopper.db, 'IN', shopper.id);
    expect(await listMyCases(other.db, 'IN', other.id)).toEqual([]);
    expect(await getCase(other.db, 'IN', opened.id, null)).toBeNull();
    const { data: messages } = await other.db.from('support_messages').select('id').eq('case_id', opened.id);
    expect(messages).toEqual([]);
    expect(await failure(replyToCase(other.db, opened.id, 'Can I butt in?'))).toBe('case_not_found:');
    expect(await failure(closeCase(other.db, opened.id))).toBe('case_not_found:');
    expect((await listCaseQueue(other.db, 'IN')).cases).toEqual([]);

    // writes only go through the functions
    const direct = await shopper.db.from('support_cases').update({ status: 'closed' }).eq('id', opened.id).select('id');
    expect(direct.data ?? []).toEqual([]);
    const insert = await shopper.db.from('support_messages').insert({ case_id: opened.id, author: 'agent', body: 'Fake agent reply' });
    expect(insert.error).not.toBeNull();

    const { data: seen } = await anon().from('support_cases').select('id');
    expect(seen ?? []).toEqual([]);
    const call = await anon().rpc('open_support_case', { p_market: 'IN', p_topic: 'other', p_subject: 'Hello', p_body: 'Long enough body' });
    expect(call.error).not.toBeNull();
  });

  it('closes a case for good', async () => {
    const [opened] = await listMyCases(shopper.db, 'IN', shopper.id);
    const closed = await closeCase(shopper.db, opened.id);
    expect(closed.status).toBe('closed');
    expect(closed.closedAt).not.toBeNull();
    expect((await closeCase(agent.db, opened.id)).closedAt).toBe(closed.closedAt);
    expect(await failure(replyToCase(shopper.db, opened.id, 'One more thing'))).toBe('case_closed:');
    expect(await failure(replyToCase(agent.db, opened.id, 'One more thing'))).toBe('case_closed:');
    expect((await listCaseQueue(agent.db, 'IN', { view: 'closed' })).cases.map((c) => c.id)).toContain(opened.id);
  });

  it('caps open cases at five per store', async () => {
    const open = (n: number, market: 'US' | 'IN' = 'IN') =>
      openCase(shopper.db, market, { topic: 'other', subject: `Question ${n}`, body: `This is question number ${n}.` });
    const five = [];
    for (let n = 1; n <= 5; n++) five.push(await open(n));
    expect(await failure(open(6))).toBe('too_many_cases:');
    // answered cases still count; the other store has its own five
    await replyToCase(agent.db, five[0].id, 'Answered, but not closed.');
    expect(await failure(open(6))).toBe('too_many_cases:');
    await expect(open(7, 'US')).resolves.toMatchObject({ status: 'open' });
    // closing one makes room
    await closeCase(shopper.db, five[1].id);
    await expect(open(8)).resolves.toMatchObject({ status: 'open' });
  });
});
