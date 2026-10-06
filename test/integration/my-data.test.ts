import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAddress } from '@/lib/data/addresses';
import { createCollection } from '@/lib/data/collections';
import { exportMyData } from '@/lib/data/my-data';
import { placeOrder } from '@/lib/data/orders';
import { askQuestion } from '@/lib/data/questions';
import { requestReturn } from '@/lib/data/returns';
import { admin, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

describe('downloading your data', () => {
  let me: TestUser;
  let other: TestUser;
  beforeAll(async () => {
    [me, other] = await Promise.all([newUser('Data Asker'), newUser('Someone Else')]);
    // an admin can read every shopper's returns: the export still holds only their own
    const boss = await admin().from('admins').insert({ user_id: me.id });
    if (boss.error) throw boss.error;
  });
  afterAll(async () => {
    await admin().from('admins').delete().eq('user_id', me.id);
    await Promise.all([deleteUser(me), deleteUser(other)]);
  });

  it("holds the shopper's orders, returns, addresses, lists, questions and balances, and no one else's", async () => {
    const p = await pickProduct('IN', 36);
    const theirs = await placeOrder(other.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId: p.id, qty: 1 } });
    await deliveredDaysAgo(theirs.id, 1);
    const theirReturn = await requestReturn(other.db, theirs.id, { items: [{ productId: p.id, qty: 1 }], reason: 'no_longer_needed' });

    const mine = await placeOrder(me.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId: p.id, qty: 1 } });
    await deliveredDaysAgo(mine.id, 1);
    const myReturn = await requestReturn(me.db, mine.id, { items: [{ productId: p.id, qty: 1 }], reason: 'damaged' });
    const address = await createAddress(me.db, 'US', { ...US_SHIPPING, instructions: 'Leave it at the back door' });
    const list = await createCollection(me.db, 'US', { name: 'Gift ideas', note: 'for the holidays' });
    const q = await pickProduct('US', 56);
    const question = await askQuestion(me.db, q.id, me.id, 'Does this come with a warranty card?');

    const data = await exportMyData(me.db, { id: me.id, email: me.email });
    expect(data.account).toMatchObject({ id: me.id, email: me.email, name: 'Data Asker' });
    expect(data.account.createdAt).toBeTruthy();
    expect(data.plus).toBeNull();

    expect(data.stores.IN.currency).toBe('INR');
    expect(data.stores.IN.orders.map((o) => o.id)).toEqual([mine.id]);
    expect(data.stores.US.orders).toEqual([]);
    expect(data.returns.map((r) => r.id)).toEqual([myReturn.id]);
    expect(data.returns.map((r) => r.id)).not.toContain(theirReturn.id);
    expect(data.returns[0]).toMatchObject({ orderId: mine.id, reason: 'damaged', items: [{ productId: p.id, qty: 1 }] });

    expect(data.stores.US.addresses).toEqual([expect.objectContaining({ id: address.id, instructions: 'Leave it at the back door' })]);
    expect(data.stores.IN.addresses).toEqual([]);
    expect(data.stores.US.lists).toContainEqual(expect.objectContaining({ id: list.id, name: 'Gift ideas', note: 'for the holidays', items: [] }));
    expect(data.questions).toEqual([expect.objectContaining({ id: question.id, productId: q.id, body: 'Does this come with a warranty card?' })]);
    expect(data.answers).toEqual([]);
    expect(data.stores.US.giftCardBalanceMinor).toBe(100_000_000);
    expect(data.stores.US.currency).toBe('USD');

    // a plain JSON file: no functions or dates that wouldn't survive the trip
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
});
