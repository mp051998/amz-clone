import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/v1/products/[id]/route';
import { addToCart } from '@/lib/data/cart';
import { placeOrder } from '@/lib/data/orders';
import { returnSignal } from '@/lib/data/return-signal';
import { requestReturn } from '@/lib/data/returns';
import type { Order, ReturnReason } from '@/lib/types';
import { admin, anon, deleteUser, deliveredDaysAgo, newUser, US_SHIPPING, type TestUser } from './helpers';

/**
 * This file's own tee, in S, M and L: with 24 in stock pickProduct() never picks it, so no other
 * file's orders or returns count towards its signal. Removed again once the shopper is gone.
 */
const tee = `zz-fit-signal-${crypto.randomUUID().slice(0, 8)}`;

let buyer: TestUser;
let order: Order;

const fit = async () => (await returnSignal(anon(), tee)).fit;
const back = (reason: ReturnReason, qty: number) => requestReturn(buyer.db, order.id, { items: [{ productId: tee, qty }], reason });

beforeAll(async () => {
  const { data: like, error } = await admin()
    .from('products')
    .select('category_slug, seller, ships_from, image')
    .eq('market_id', 'US')
    .is('variant_group', null)
    .is('archived_at', null)
    .order('id')
    .limit(1)
    .single();
  if (error) throw error;
  const made = await admin()
    .from('products')
    .insert({ id: tee, market_id: 'US', ...like, title: 'Fit signal test tee', price_minor: 1200, stock: 24, position: 900_200, sizes: ['S', 'M', 'L'] });
  if (made.error) throw made.error;
  buyer = await newUser('Fit Buyer');
  await addToCart(buyer.db, 'US', tee, 10, null, 'M');
  order = await placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
  await deliveredDaysAgo(order.id, 1);
}, 60_000);

afterAll(async () => {
  await deleteUser(buyer);
  await admin().from('products').delete().eq('id', tee);
});

describe('fit from returns', () => {
  it('says nothing with no size returns', async () => {
    expect(await fit()).toBeNull();
    await back('no_longer_needed', 1);
    expect(await fit()).toBeNull();
  });

  it('runs small once 3 units came back too small, an exchange among them', async () => {
    await back('too_small', 1);
    expect(await fit()).toBeNull(); // 1 unit: too few to tell
    await requestReturn(buyer.db, order.id, { items: [{ productId: tee, qty: 1, size: 'L' }], reason: 'too_small', resolution: 'replacement' });
    await back('too_small', 1);
    expect(await fit()).toBe('small');
  });

  it('one too large beside them doesn’t tip it; a second evens it out', async () => {
    await back('too_large', 1);
    expect(await fit()).toBe('small');
    await back('too_large', 1);
    expect(await fit()).toBeNull();
  });

  it('the product API has it', async () => {
    await back('too_small', 1);
    const token = (await buyer.db.auth.getSession()).data.session!.access_token;
    const res = await GET(new NextRequest(`http://localhost/api/v1/products/${tee}`, { headers: { authorization: `Bearer ${token}` } }), {
      params: Promise.resolve({ id: tee }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).fit).toBe('small');
  });
});
