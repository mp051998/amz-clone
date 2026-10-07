import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setCartQty } from '@/lib/data/cart';
import { listAdminReturns, receiveReturn } from '@/lib/data/admin-returns';
import { DataError } from '@/lib/data/errors';
import { placeOrder } from '@/lib/data/orders';
import { cancelReturn, getOrderReturns, requestReturn, returnSummaries } from '@/lib/data/returns';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/v1/orders/[id]/returns/route';
import type { Order } from '@/lib/types';
import { admin, deleteUser, deliveredDaysAgo, newUser, pickProduct, setStock, stockOf, US_SHIPPING, type TestUser } from './helpers';

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}${err.detail ? `:${err.detail}` : ''}` : String(err);
  }
  return 'no error';
};

let buyer: TestUser;
let boss: TestUser;
let order: Order;
let a: string;
let b: string;

beforeAll(async () => {
  [buyer, boss] = await Promise.all([newUser('Replacement Buyer'), newUser('Replacement Admin')]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  const [pa, pb] = await Promise.all([pickProduct('US', 83), pickProduct('US', 84)]);
  [a, b] = [pa.id, pb.id];
  await setCartQty(buyer.db, 'US', a, 2);
  await setCartQty(buyer.db, 'US', b, 1);
  order = await placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
  await deliveredDaysAgo(order.id, 1);
});

afterAll(async () => {
  await Promise.all([deleteUser(buyer), deleteUser(boss)]);
});

describe('replacements', () => {
  let swap: string;

  it('offers every delivered item for a swap, only for a store-fault reason', async () => {
    const r = (await getOrderReturns(buyer.db, order.id))!;
    expect(r.replaceable).toEqual({ [a]: 2, [b]: 1 });
    // the database holds the line too, not just the app
    const res = await buyer.db.rpc('request_return', {
      p_order_id: order.id,
      p_items: [{ product_id: a, qty: 1 }],
      p_reason: 'better_price',
      p_resolution: 'replacement',
    });
    expect(res.error).toMatchObject({ message: 'invalid_input', details: 'resolution' });
  });

  it('sends the same items now at no charge, out of stock, and they stay returnable for a refund', async () => {
    const before = await stockOf(a);
    const r = await requestReturn(buyer.db, order.id, { items: [{ productId: a, qty: 1 }], reason: 'damaged', resolution: 'replacement' });
    swap = r.id;
    expect(r).toMatchObject({ status: 'requested', resolution: 'replacement', itemsMinor: 0, taxMinor: 0, shipMinor: 0, refundMinor: 0 });
    const ships = Date.parse(r.replacement!.shippedAt);
    expect(ships).toBeGreaterThan(Date.now());
    expect(Date.parse(r.replacement!.deliveredAt)).toBeGreaterThan(ships);
    expect(await stockOf(a)).toBe(before - 1);

    const now = (await getOrderReturns(buyer.db, order.id))!;
    expect(now.returnable).toEqual({ [a]: 2, [b]: 1 });
    expect(now.replaceable).toEqual({ [a]: 1, [b]: 1 });
    expect(await returnSummaries(buyer.db, [order.id])).toEqual(new Map([[order.id, 'replacement']]));
  });

  it('replaces each unit once, and only what’s in stock', async () => {
    expect(await failure(requestReturn(buyer.db, order.id, { items: [{ productId: a, qty: 2 }], reason: 'defective', resolution: 'replacement' }))).toBe(
      'replacement_unavailable:already_replaced',
    );
    const stock = await stockOf(b);
    await setStock(b, 0);
    try {
      expect((await getOrderReturns(buyer.db, order.id))!.replaceable[b]).toBe(0);
      expect(await failure(requestReturn(buyer.db, order.id, { items: [{ productId: b, qty: 1 }], reason: 'wrong_item', resolution: 'replacement' }))).toBe(
        'replacement_unavailable:out_of_stock',
      );
    } finally {
      await setStock(b, stock);
    }
  });

  it('can be called off until it ships, which puts the stock back', async () => {
    const before = await stockOf(b);
    const r = await requestReturn(buyer.db, order.id, { items: [{ productId: b, qty: 1 }], reason: 'missing_parts', resolution: 'replacement' });
    expect(await stockOf(b)).toBe(before - 1);
    expect(await cancelReturn(buyer.db, r.id)).toMatchObject({ status: 'cancelled' });
    expect(await stockOf(b)).toBe(before);
    expect((await getOrderReturns(buyer.db, order.id))!.replaceable[b]).toBe(1);

    const { error } = await admin()
      .from('returns')
      .update({ replacement_shipped_at: new Date(Date.now() - 3_600_000).toISOString() })
      .eq('id', swap);
    if (error) throw error;
    expect(await failure(cancelReturn(buyer.db, swap))).toBe('replacement_shipped');
  });

  it('the API takes the resolution too', async () => {
    const token = (await buyer.db.auth.getSession()).data.session!.access_token;
    const req = new NextRequest(`http://localhost/api/v1/orders/${order.id}/returns`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ productId: b, qty: 1 }], reason: 'not_as_described', resolution: 'replacement' }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: order.id }) });
    expect(res.status).toBe(201);
    expect((await res.json()).return).toMatchObject({ resolution: 'replacement', refundMinor: 0 });
  });

  it('a later refund return prices the items in full; receiving the swapped ones restocks and refunds nothing', async () => {
    const unit = order.items.find((i) => i.productId === a)!.unitPriceMinor;
    const refund = await requestReturn(buyer.db, order.id, { items: [{ productId: a, qty: 2 }], reason: 'defective' });
    expect(refund).toMatchObject({ resolution: 'refund', itemsMinor: 2 * unit });
    expect(refund.taxMinor).toBeGreaterThan(0);

    const open = await listAdminReturns(boss.db, 'US');
    expect(open.returns.find((x) => x.id === swap)).toMatchObject({ resolution: 'replacement', order: { id: order.id } });

    const stock = await stockOf(a);
    const got = await receiveReturn(boss.db, swap);
    expect(got).toMatchObject({ status: 'received', refundMinor: 0, refund: { status: 'succeeded' } });
    expect(await stockOf(a)).toBe(stock + 1);
  });
});
