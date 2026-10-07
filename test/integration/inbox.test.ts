import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { receiveReturn } from '@/lib/data/admin-returns';
import { listInbox } from '@/lib/data/inbox';
import { cancelOrder, placeOrder } from '@/lib/data/orders';
import { answerQuestion, askQuestion } from '@/lib/data/questions';
import { requestReturn } from '@/lib/data/returns';
import { openCase, replyToCase } from '@/lib/data/support';
import { admin, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, pickProduct, type TestUser } from './helpers';

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
});
