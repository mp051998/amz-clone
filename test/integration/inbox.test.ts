import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { receiveReturn } from '@/lib/data/admin-returns';
import { inboxSeenAt, listInbox, markInboxSeen } from '@/lib/data/inbox';
import { cancelOrder, placeOrder } from '@/lib/data/orders';
import { answerQuestion, askQuestion } from '@/lib/data/questions';
import { requestReturn } from '@/lib/data/returns';
import { upsertReview } from '@/lib/data/reviews';
import { openCase, replyToCase } from '@/lib/data/support';
import { admin, anon, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, pickProduct, type TestUser } from './helpers';

describe('your messages', () => {
  let shopper: TestUser;
  let other: TestUser;
  let agent: TestUser;
  beforeAll(async () => {
    [shopper, other, agent] = await Promise.all([newUser('Inbox Reader'), newUser('Inbox Answerer'), newUser('Inbox Agent')]);
    const { error } = await admin().from('admins').insert({ user_id: agent.id });
    if (error) throw error;
  });
  afterAll(async () => {
    await admin().from('support_cases').delete().eq('user_id', shopper.id);
    await admin().from('admins').delete().eq('user_id', agent.id);
    await Promise.all([shopper, other, agent].map(deleteUser));
  });

  const inbox = (u: TestUser, market: 'US' | 'IN' = 'IN') => listInbox(u.db, market, u.id, new Date(), 'Asia/Kolkata');

  it('gathers order, return, support and answer updates, newest first', async () => {
    const [p1, p2, p3] = await Promise.all([pickProduct('IN', 46), pickProduct('IN', 47), pickProduct('IN', 48)]);
    expect(await inbox(shopper)).toEqual([]);

    // delivered yesterday, then a return the store received
    const delivered = await placeOrder(shopper.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId: p1.id, qty: 2 } });
    await deliveredDaysAgo(delivered.id, 1);
    const ret = await requestReturn(shopper.db, delivered.id, { items: [{ productId: p1.id, qty: 1 }], reason: 'damaged' });
    const received = await receiveReturn(agent.db, ret.id);

    // cancelled before it shipped
    const cancelled = await cancelOrder(shopper.db, (await placeOrder(shopper.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId: p2.id, qty: 1 } })).id);

    // the store replied on a case
    const opened = await openCase(shopper.db, 'IN', { topic: 'delivery', subject: 'Box was crushed', body: 'The box arrived crushed but the item seems fine.' });
    const reply = await replyToCase(agent.db, opened.id, 'Sorry about that. Keep us posted if anything is damaged.');

    // someone answered the shopper's question; the shopper's own answer isn't news to them
    const question = await askQuestion(shopper.db, p3.id, shopper.id, 'Does this come with a warranty card?');
    const answer = await answerQuestion(other.db, question.id, other.id, 'Yes, a one-year card is in the box.');
    await answerQuestion(shopper.db, question.id, shopper.id, 'Update: found the card, thanks.');

    const got = await inbox(shopper);
    const keys = got.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        `shipped:${delivered.id}`,
        `out_for_delivery:${delivered.id}`,
        `delivered:${delivered.id}`,
        `return_received:${ret.id}`,
        `cancelled:${cancelled.id}`,
        `support_reply:${reply.id}`,
        `answer:${answer.id}`,
      ]),
    );
    if (received.refund?.status === 'succeeded') expect(keys).toContain(`return_refunded:${ret.id}`);
    expect(got.filter((m) => m.kind === 'answer')).toHaveLength(1);
    // the cash-on-delivery order was never charged, so there's no refund to tell about
    expect(keys).not.toContain(`refunded:${cancelled.id}`);
    expect(got.map((m) => Date.parse(m.at))).toEqual(got.map((m) => Date.parse(m.at)).sort((a, b) => b - a));

    expect(got.find((m) => m.key === `support_reply:${reply.id}`)).toMatchObject({ subject: 'Box was crushed', href: `/customer-service/cases/${opened.id}` });
    expect(got.find((m) => m.key === `answer:${answer.id}`)).toMatchObject({
      subject: 'Does this come with a warranty card?',
      detail: 'Yes, a one-year card is in the box.',
      href: `/product/${p3.id}#questions`,
    });
    expect(got.find((m) => m.key === `return_received:${ret.id}`)).toMatchObject({ orderId: delivered.id, subject: delivered.items[0].title });

    // nobody else's, and nothing from the other store
    expect(await inbox(other)).toEqual([]);
    expect(await inbox(shopper, 'US')).toEqual([]);
  });

  it('remembers when the shopper last read them, per store', async () => {
    expect(await inboxSeenAt(shopper.db, 'IN')).toBeNull();
    const before = Date.now();
    await markInboxSeen(shopper.db, 'IN');
    const first = await inboxSeenAt(shopper.db, 'IN');
    expect(first).not.toBeNull();
    expect(Date.parse(first!)).toBeGreaterThanOrEqual(before - 60_000);

    // reading again moves it on, never back
    await markInboxSeen(shopper.db, 'IN');
    const second = await inboxSeenAt(shopper.db, 'IN');
    expect(Date.parse(second!)).toBeGreaterThanOrEqual(Date.parse(first!));

    // the other store and other shoppers are untouched
    expect(await inboxSeenAt(shopper.db, 'US')).toBeNull();
    expect(await inboxSeenAt(other.db, 'IN')).toBeNull();

    const bad = await shopper.db.rpc('mark_inbox_seen', { p_market: 'XX' });
    expect(bad.error?.message).toBe('invalid_input');
  });

  it('only the function writes it, and only for the signed-in', async () => {
    const insert = await other.db.from('inbox_reads').insert({ user_id: other.id, market_id: 'IN', seen_at: '2999-01-01T00:00:00Z' });
    expect(insert.error).not.toBeNull();
    await markInboxSeen(other.db, 'US');
    const update = await other.db.from('inbox_reads').update({ seen_at: '2999-01-01T00:00:00Z' }).eq('user_id', other.id);
    expect(update.error).not.toBeNull();
    expect(Date.parse((await inboxSeenAt(other.db, 'US'))!)).toBeLessThan(Date.parse('2999-01-01T00:00:00Z'));

    const call = await anon().rpc('mark_inbox_seen', { p_market: 'IN' });
    expect(call.error).not.toBeNull();
    const read = await anon().from('inbox_reads').select('seen_at');
    expect(read.data ?? []).toEqual([]);
  });

  it('asks for a review a couple of days after something arrives, until it is reviewed', async () => {
    const reviewer = await newUser('Inbox Reviewer');
    try {
      const p = await pickProduct('IN', 53);
      const o = await placeOrder(reviewer.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId: p.id, qty: 1 } });
      await deliveredDaysAgo(o.id, 1);
      // arrived yesterday: too soon to ask
      expect((await inbox(reviewer)).filter((m) => m.kind === 'review_request')).toEqual([]);
      await deliveredDaysAgo(o.id, 3);
      const [ask] = (await inbox(reviewer)).filter((m) => m.kind === 'review_request');
      expect(ask).toMatchObject({ key: `review_request:${p.id}`, orderId: o.id, href: `/product/${p.id}#write-review` });
      // the US store's messages don't ask about it
      expect((await inbox(reviewer, 'US')).filter((m) => m.kind === 'review_request')).toEqual([]);
      await upsertReview(reviewer.db, p.id, reviewer.id, { rating: 5, title: 'Works well', body: 'Does what it says, every day.' });
      expect((await inbox(reviewer)).filter((m) => m.kind === 'review_request')).toEqual([]);
    } finally {
      await deleteUser(reviewer);
    }
  });
});
