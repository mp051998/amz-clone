import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataError } from '@/lib/data/errors';
import { listInbox } from '@/lib/data/inbox';
import { placeOrder } from '@/lib/data/orders';
import { getCase, isStoreSeller, listCaseOrders, listCaseQueue, listMyCases, openCase, replyToCase } from '@/lib/data/support';
import { admin, anon, deleteUser, IN_SHIPPING, newUser, type TestUser } from './helpers';

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
  return 'no error';
};

/** Two IN products in stock from different sellers. */
async function twoSellers(): Promise<[{ id: string; seller: string }, { id: string; seller: string }]> {
  const { data, error } = await admin().from('products').select('id, seller').eq('market_id', 'IN').gte('stock', 25).is('archived_at', null).order('id').range(50, 120);
  if (error || !data?.length) throw error ?? new Error('no products');
  const first = data[0];
  const second = data.find((p) => p.seller !== first.seller);
  if (!second) throw new Error('only one seller');
  return [first, second];
}

describe('contact seller', () => {
  let shopper: TestUser;
  let agent: TestUser;
  let bought: { id: string; seller: string };
  let notBought: { id: string; seller: string };
  let orderId: string;
  beforeAll(async () => {
    [shopper, agent] = await Promise.all([newUser('Seller Asker'), newUser('Seller Agent')]);
    const { error } = await admin().from('admins').insert({ user_id: agent.id });
    if (error) throw error;
    [bought, notBought] = await twoSellers();
    orderId = (await placeOrder(shopper.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId: bought.id, qty: 1 } })).id;
  });
  afterAll(async () => {
    await admin().from('support_cases').delete().eq('user_id', shopper.id);
    await admin().from('admins').delete().eq('user_id', agent.id);
    await Promise.all([shopper, agent].map(deleteUser));
  });

  it('knows who sells in the store', async () => {
    expect(await isStoreSeller(shopper.db, 'IN', bought.seller)).toBe(true);
    expect(await isStoreSeller(shopper.db, 'IN', 'Nobody Sells Here Ltd')).toBe(false);
    expect(await isStoreSeller(shopper.db, 'IN', '  ')).toBe(false);
  });

  it('offers only the orders with the seller’s items', async () => {
    expect((await listCaseOrders(shopper.db, 'IN', shopper.id, 20, bought.seller)).map((o) => o.id)).toEqual([orderId]);
    expect(await listCaseOrders(shopper.db, 'IN', shopper.id, 20, notBought.seller)).toEqual([]);
  });

  it('opens a case with the seller about an order of theirs', async () => {
    const opened = await openCase(shopper.db, 'IN', {
      topic: 'order',
      subject: 'Does it come with a manual?',
      body: 'The box had no manual in it. Can you send one?',
      orderId,
      seller: ` ${bought.seller} `,
    });
    expect(opened).toMatchObject({ seller: bought.seller, orderId, status: 'open', customer: 'Seller Asker' });
    expect((await listMyCases(shopper.db, 'IN', shopper.id)).find((c) => c.id === opened.id)?.seller).toBe(bought.seller);

    // the admins answer it for the seller, and the shopper's inbox says who replied
    const queued = (await listCaseQueue(agent.db, 'IN')).cases.find((c) => c.id === opened.id);
    expect(queued?.seller).toBe(bought.seller);
    await replyToCase(agent.db, opened.id, 'Sorry about that. A manual is on its way.');
    expect((await getCase(shopper.db, 'IN', opened.id, shopper.id))?.status).toBe('answered');
    const reply = (await listInbox(shopper.db, 'IN', shopper.id)).find((m) => m.kind === 'support_reply' && m.href.endsWith(opened.id));
    expect(reply?.from).toBe(bought.seller);
  });

  it('opens one without an order, and store cases have no seller', async () => {
    const general = await openCase(shopper.db, 'IN', { topic: 'other', subject: 'Do you ship gift wrap?', body: 'Thinking of buying one as a present.', seller: notBought.seller });
    expect(general).toMatchObject({ seller: notBought.seller, orderId: null });
    const store = await openCase(shopper.db, 'IN', { topic: 'other', subject: 'A store question', body: 'Asking the store, not a seller.' });
    expect(store.seller).toBeUndefined();
  });

  it('turns away unknown sellers and orders without their items', async () => {
    const ask = (seller: string, order?: string) =>
      openCase(shopper.db, 'IN', { topic: 'order', subject: 'A question', body: 'Asking the seller a question.', seller, orderId: order });
    expect(await failure(ask('Nobody Sells Here Ltd'))).toBe('seller_not_found:');
    expect(await failure(ask(notBought.seller, orderId))).toBe('order_not_found:seller');
    // the seller's store matters too: this order is in IN
    const us = await openCase(shopper.db, 'US', { topic: 'order', subject: 'Wrong store', body: 'Asking in the other store.', orderId, seller: bought.seller }).catch((e) => e);
    expect(us instanceof DataError && ['seller_not_found', 'order_not_found'].includes(us.code)).toBe(true);

    // the database checks it too, and needs a signed-in shopper
    const raw = await shopper.db.rpc('contact_seller', { p_market: 'IN', p_seller: bought.seller, p_topic: 'refund', p_subject: 'Hello', p_body: 'Long enough body' });
    expect([raw.error?.message, raw.error?.details]).toEqual(['invalid_input', 'topic']);
    const call = await anon().rpc('contact_seller', { p_market: 'IN', p_seller: bought.seller, p_topic: 'other', p_subject: 'Hello', p_body: 'Long enough body' });
    expect(call.error).not.toBeNull();
    // and the seller column can't be written directly
    const [mine] = await listMyCases(shopper.db, 'IN', shopper.id);
    const direct = await shopper.db.from('support_cases').update({ seller: 'Someone Else' }).eq('id', mine.id).select('id');
    expect(direct.data ?? []).toEqual([]);
  });
});
