import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/v1/orders/[id]/returns/route';
import { addToCart } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { placeOrder } from '@/lib/data/orders';
import { getOrderReturns, requestReturn } from '@/lib/data/returns';
import type { Json } from '@/lib/db/database.types';
import type { Order } from '@/lib/types';
import { admin, deleteUser, deliveredDaysAgo, newUser, stockOf, US_SHIPPING, type TestUser } from './helpers';

/**
 * This file's own tee, in S, M and L: with 24 in stock pickProduct() never picks it, so no other
 * file's sizes or stock change under it. Removed again once the shopper (and so the order) is gone.
 */
const tee = `zz-size-exchange-${crypto.randomUUID().slice(0, 8)}`;

let buyer: TestUser;
let order: Order;

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}${err.detail ? `:${err.detail}` : ''}` : String(err);
  }
  return 'no error';
};

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
    .insert({ id: tee, market_id: 'US', ...like, title: 'Size exchange test tee', price_minor: 1500, stock: 24, position: 900_100, sizes: ['S', 'M', 'L'] });
  if (made.error) throw made.error;
  buyer = await newUser('Exchange Buyer');
  await addToCart(buyer.db, 'US', tee, 3, null, 'M');
  order = await placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
  await deliveredDaysAgo(order.id, 1);
}, 60_000);

afterAll(async () => {
  await deleteUser(buyer);
  await admin().from('products').delete().eq('id', tee);
});

describe('size exchanges', () => {
  it('needs a size the tee comes in, other than the one ordered, and only for a size reason', async () => {
    const stock = await stockOf(tee);
    const swap = (size?: string, reason = 'too_small') =>
      failure(requestReturn(buyer.db, order.id, { items: [{ productId: tee, qty: 1, ...(size ? { size } : {}) }], reason, resolution: 'replacement' }));
    expect(await swap()).toBe('invalid_input:size');
    expect(await swap('M')).toBe('invalid_input:size');
    expect(await swap('XL')).toBe('invalid_input:size');
    expect(await swap('L', 'no_longer_needed')).toBe('invalid_input:resolution');
    // the database holds the line too: a size on a refund, or two sizes for one product
    const rpc = (items: Json[], resolution?: string) =>
      buyer.db.rpc('request_return', { p_order_id: order.id, p_items: items, p_reason: 'too_large', ...(resolution ? { p_resolution: resolution } : {}) });
    expect((await rpc([{ product_id: tee, qty: 1, size: 'S' }])).error).toMatchObject({ message: 'invalid_input', details: 'size' });
    expect((await rpc([{ product_id: tee, qty: 1, size: 'S' }, { product_id: tee, qty: 1, size: 'L' }], 'replacement')).error).toMatchObject({
      message: 'invalid_input',
      details: 'size',
    });
    expect(await stockOf(tee)).toBe(stock);
  });

  it('sends the new size now, at no charge, out of stock, and shows it on the return', async () => {
    const stock = await stockOf(tee);
    const r = await requestReturn(buyer.db, order.id, { items: [{ productId: tee, qty: 1, size: 'L' }], reason: 'too_small', resolution: 'replacement' });
    expect(r).toMatchObject({ status: 'requested', reason: 'too_small', resolution: 'replacement', refundMinor: 0 });
    expect(r.items).toEqual([expect.objectContaining({ productId: tee, qty: 1, size: 'M', exchangeSize: 'L' })]);
    expect(Date.parse(r.replacement!.deliveredAt)).toBeGreaterThan(Date.now());
    expect(await stockOf(tee)).toBe(stock - 1);
    const now = (await getOrderReturns(buyer.db, order.id))!;
    expect(now.replaceable).toEqual({ [tee]: 2 });
    expect(now.returns.find((x) => x.id === r.id)?.items[0].exchangeSize).toBe('L');
  });

  it('a store-fault replacement can go without a size, for the same one', async () => {
    const r = await requestReturn(buyer.db, order.id, { items: [{ productId: tee, qty: 1 }], reason: 'defective', resolution: 'replacement' });
    expect(r.items[0]).toMatchObject({ size: 'M' });
    expect(r.items[0].exchangeSize).toBeUndefined();
  });

  it('the API takes each item’s size', async () => {
    const token = (await buyer.db.auth.getSession()).data.session!.access_token;
    const post = (body: unknown) =>
      POST(
        new NextRequest(`http://localhost/api/v1/orders/${order.id}/returns`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: order.id }) },
      );
    const bad = await post({ items: [{ productId: tee, qty: 1 }], reason: 'too_large', resolution: 'replacement' });
    expect(bad.status).toBe(422);
    expect((await bad.json()).error).toMatchObject({ code: 'invalid_input', detail: 'size' });
    const res = await post({ items: [{ productId: tee, qty: 1, size: 'S' }], reason: 'too_large', resolution: 'replacement' });
    expect(res.status).toBe(201);
    expect((await res.json()).return).toMatchObject({ resolution: 'replacement', items: [expect.objectContaining({ size: 'M', exchangeSize: 'S' })] });
  });

  it('a refund for a size reason isn’t the store’s fault, so the delivery stays charged', async () => {
    const r = await requestReturn(buyer.db, order.id, { items: [{ productId: tee, qty: 1, size: 'S' }], reason: 'too_large' });
    expect(r).toMatchObject({ reason: 'too_large', resolution: 'refund', shipMinor: 0, itemsMinor: 1500 });
    expect(r.items[0].exchangeSize).toBeUndefined();
  });
});
