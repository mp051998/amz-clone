import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { protectionOffer } from '@/lib/data/cart';
import { placeOrder } from '@/lib/data/orders';
import { requestReturn } from '@/lib/data/returns';
import type { Order } from '@/lib/types';
import { admin, anon, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, type TestUser } from './helpers';

/** This file's product: the first the store covers among pickProduct()'s list (by id, 25+ in stock) at IN offsets 70–84. */
async function covered() {
  const { data, error } = await admin().from('products').select('id').eq('market_id', 'IN').gte('stock', 25).order('id').range(70, 84);
  if (error) throw error;
  const offers = await Promise.all(data.map((p) => protectionOffer(anon(), p.id)));
  const i = offers.findIndex((o) => o != null);
  if (i < 0) throw new Error('no covered IN product at offsets 70–84');
  return { id: data[i].id, plan: offers[i]! };
}

let buyer: TestUser;
let p: { id: string; plan: number };
let order: Order;

beforeAll(async () => {
  [buyer, p] = await Promise.all([newUser('Return Protection Buyer'), covered()]);
  order = await placeOrder(buyer.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId: p.id, qty: 3, protection: true } });
  await deliveredDaysAgo(order.id, 1);
});

afterAll(async () => {
  await deleteUser(buyer);
});

describe('returning an item with a protection plan', () => {
  it('refunds the returned units’ plans with them', async () => {
    expect(order.items[0].protectionMinor).toBe(p.plan);
    const r = await requestReturn(buyer.db, order.id, { items: [{ productId: p.id, qty: 2 }], reason: 'no_longer_needed' });
    expect(r.protectionMinor).toBe(2 * p.plan);
    expect(r.refundMinor).toBe(r.itemsMinor + r.taxMinor + r.shipMinor + 2 * p.plan);
  });

  it('a replacement keeps the plan and refunds nothing', async () => {
    const r = await requestReturn(buyer.db, order.id, { items: [{ productId: p.id, qty: 1 }], reason: 'defective', resolution: 'replacement' });
    expect(r).toMatchObject({ resolution: 'replacement', refundMinor: 0 });
    expect(r.protectionMinor).toBeUndefined();
  });
});
