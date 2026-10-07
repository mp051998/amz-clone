import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setCartQty } from '@/lib/data/cart';
import { placeOrder } from '@/lib/data/orders';
import { returnSignal } from '@/lib/data/return-signal';
import { cancelReturn, requestReturn } from '@/lib/data/returns';
import type { Order } from '@/lib/types';
import { admin, anon, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, pickProduct, type TestUser } from './helpers';

describe('customers usually keep this item', () => {
  let buyer: TestUser;
  let product: string;
  const orders: Order[] = [];

  const buyFive = async () => {
    await buyer.db.rpc('cart_clear', { p_market: 'IN' });
    await setCartQty(buyer.db, 'IN', product, 5);
    const order = await placeOrder(buyer.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING });
    orders.push(order);
    await deliveredDaysAgo(order.id, 3);
    return order;
  };
  const signal = () => returnSignal(anon(), product);

  beforeAll(async () => {
    buyer = await newUser('Keeps Everything');
    // IN offset 105 is this file's
    product = (await pickProduct('IN', 105)).id;
  });
  afterAll(async () => {
    if (orders.length) await admin().from('orders').delete().in('id', orders.map((o) => o.id));
    await deleteUser(buyer);
  });

  it('says so once 20 units were delivered and at most 1 in 50 came back', async () => {
    for (let i = 0; i < 3; i++) await buyFive();
    expect(await signal()).toEqual({ frequent: null, usuallyKept: false }); // 15 units: too few to tell

    const fourth = await buyFive();
    expect(await signal()).toEqual({ frequent: null, usuallyKept: true });

    const back = await requestReturn(buyer.db, fourth.id, { items: [{ productId: product, qty: 1 }], reason: 'no_longer_needed' });
    expect(await signal()).toEqual({ frequent: null, usuallyKept: false }); // 1 of 20 back

    await cancelReturn(buyer.db, back.id);
    expect(await signal()).toEqual({ frequent: null, usuallyKept: true });

    // only the last 90 days of deliveries count
    await deliveredDaysAgo(orders[0].id, 100);
    expect(await signal()).toEqual({ frequent: null, usuallyKept: false });
  });
});
