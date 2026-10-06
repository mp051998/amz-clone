import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { receiveReturn } from '@/lib/data/admin-returns';
import { cancelOrder, placeOrder } from '@/lib/data/orders';
import { requestReturn } from '@/lib/data/returns';
import { listTransactions } from '@/lib/data/transactions';
import type { Market, PaymentMethod } from '@/lib/types';
import { admin, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

describe('your transactions', () => {
  let me: TestUser;
  let other: TestUser;
  let boss: TestUser;
  beforeAll(async () => {
    [me, other, boss] = await Promise.all([newUser('Ledger Shopper'), newUser('Ledger Other'), newUser('Ledger Admin')]);
    const { error } = await admin().from('admins').insert({ user_id: boss.id });
    if (error) throw error;
  });
  afterAll(async () => {
    await Promise.all([deleteUser(me), deleteUser(other), deleteUser(boss)]);
  });

  async function order(market: Market, offset: number, paymentMethod: PaymentMethod = 'giftcard') {
    const p = await pickProduct(market, offset);
    return placeOrder(me.db, market, { paymentMethod, shipping: market === 'IN' ? IN_SHIPPING : US_SHIPPING, buyNow: { productId: p.id, qty: 1 } });
  }

  it("lists a shopper's charges and refunds per store: orders, cancellations, returns, cash on delivery", async () => {
    const kept = await order('US', 58);
    const cancelled = await cancelOrder(me.db, (await order('US', 59)).id);
    const returned = await order('US', 58);
    await deliveredDaysAgo(returned.id, 2);
    const ret = await requestReturn(me.db, returned.id, { items: [{ productId: returned.items[0].productId, qty: 1 }], reason: 'damaged' });
    await receiveReturn(boss.db, ret.id);
    const cod = await order('IN', 42, 'cod');

    const us = await listTransactions(me.db, 'US', me.id);
    const byKey = new Map(us.map((t) => [t.key, t]));
    expect([...byKey.keys()].sort()).toEqual(
      [`order:${kept.id}`, `order:${cancelled.id}`, `cancel:${cancelled.id}`, `order:${returned.id}`, `return:${ret.id}`].sort(),
    );
    expect(byKey.get(`order:${kept.id}`)).toMatchObject({ kind: 'charge', amountMinor: kept.totals.totalMinor, status: 'completed', method: 'giftcard' });
    expect(byKey.get(`cancel:${cancelled.id}`)).toMatchObject({ kind: 'refund', amountMinor: cancelled.totals.totalMinor, status: 'completed' });
    expect(byKey.get(`return:${ret.id}`)).toMatchObject({ kind: 'refund', source: 'return', amountMinor: ret.refundMinor, status: 'completed', orderId: returned.id });
    // newest first
    expect(us.map((t) => Date.parse(t.at))).toEqual([...us.map((t) => Date.parse(t.at))].sort((a, b) => b - a));

    // cash on delivery is due until it's delivered
    expect((await listTransactions(me.db, 'IN', me.id)).map((t) => [t.key, t.status])).toEqual([[`order:${cod.id}`, 'due']]);
    await deliveredDaysAgo(cod.id, 1);
    expect((await listTransactions(me.db, 'IN', me.id)).map((t) => [t.key, t.status])).toEqual([[`order:${cod.id}`, 'completed']]);

    // nobody else's
    expect(await listTransactions(other.db, 'US', other.id)).toEqual([]);
  });
});
