import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setCartQty } from '@/lib/data/cart';
import { placeOrder } from '@/lib/data/orders';
import { frequentlyReturned } from '@/lib/data/return-signal';
import { cancelReturn, requestReturn } from '@/lib/data/returns';
import type { Order } from '@/lib/types';
import { admin, anon, deleteUser, deliveredDaysAgo, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

describe('frequently returned', () => {
  let buyer: TestUser;
  let product: string;
  const orders: Order[] = [];

  const buyFive = async () => {
    await buyer.db.rpc('cart_clear', { p_market: 'US' });
    await setCartQty(buyer.db, 'US', product, 5);
    const order = await placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
    orders.push(order);
    await deliveredDaysAgo(order.id, 2);
    return order;
  };
  const signal = () => frequentlyReturned(anon(), product);

  beforeAll(async () => {
    buyer = await newUser('Returns A Lot');
    product = (await pickProduct('US', 66)).id;
  });
  afterAll(async () => {
    if (orders.length) await admin().from('orders').delete().in('id', orders.map((o) => o.id));
    await deleteUser(buyer);
  });

  it('flags a product once 1 delivered unit in 10 comes back, over 2+ returns, with the product-side reason', async () => {
    const [first, second] = [await buyFive(), await buyFive()];
    expect(await signal()).toBeNull();

    await requestReturn(buyer.db, first.id, { items: [{ productId: product, qty: 1 }], reason: 'defective' });
    expect(await signal()).toBeNull(); // one return isn't a pattern

    const change = await requestReturn(buyer.db, second.id, { items: [{ productId: product, qty: 1 }], reason: 'no_longer_needed' });
    // 2 of 10 units back; "no longer needed" isn't about the product, so the reason is the defect
    expect(await signal()).toEqual({ reason: 'defective' });

    await cancelReturn(buyer.db, change.id);
    expect(await signal()).toBeNull();

    await requestReturn(buyer.db, second.id, { items: [{ productId: product, qty: 1 }], reason: 'better_price' });
    expect(await signal()).toEqual({ reason: 'defective' });
  });

  it('only counts the last 90 days of deliveries', async () => {
    await deliveredDaysAgo(orders[0].id, 100);
    expect(await signal()).toBeNull(); // 5 units delivered in the window
  });
});
