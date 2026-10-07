import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setCartQty } from '@/lib/data/cart';
import { storeBalance } from '@/lib/data/balance';
import { DataError } from '@/lib/data/errors';
import { cancelOrder, cancelOrderItems, getOrder, giftWrapFee, placeOrder } from '@/lib/data/orders';
import { POST } from '@/app/api/v1/orders/route';
import { anon, deleteUser, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

let buyer: TestUser;
let a: string;
let b: string;
let fee: number;

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}${err.detail ? `:${err.detail}` : ''}` : String(err);
  }
  return 'no error';
};

/** `buyer` puts 2 of a and 1 of b in the cart. */
async function fill() {
  await buyer.db.rpc('cart_clear', { p_market: 'US' });
  await setCartQty(buyer.db, 'US', a, 2);
  await setCartQty(buyer.db, 'US', b, 1);
}

beforeAll(async () => {
  buyer = await newUser('Gift Wrap Buyer');
  const [pa, pb] = await Promise.all([pickProduct('US', 85), pickProduct('US', 86)]);
  [a, b] = [pa.id, pb.id];
  fee = (await giftWrapFee(anon(), 'US'))!;
});

afterAll(async () => {
  await deleteUser(buyer);
});

describe('gift wrap', () => {
  it('is priced per item and only for a gift', async () => {
    expect(fee).toBe(399);
    expect(await giftWrapFee(anon(), 'IN')).toBe(3000);
    await fill();
    expect(await failure(placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, gift: { wrap: false } }))).toBe('no error');
    await fill();
    const res = await buyer.db.rpc('place_order', { p_market: 'US', p_payment_method: 'giftcard', p_shipping: {
      full_name: US_SHIPPING.fullName, phone: US_SHIPPING.phone, line1: US_SHIPPING.line1, city: US_SHIPPING.city, state: US_SHIPPING.state, postcode: US_SHIPPING.postcode,
    }, p_gift_wrap: true });
    expect(res.error).toMatchObject({ message: 'invalid_input', details: 'gift_wrap' });
  });

  it('adds the wrap to the total, untaxed, and gives back the cancelled units’ share', async () => {
    await fill();
    const order = await placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, gift: { message: 'Enjoy', wrap: true } });
    const t = order.totals;
    expect(order.gift).toEqual({ message: 'Enjoy', wrapped: true });
    expect(t.wrapMinor).toBe(3 * fee);
    expect(t.totalMinor).toBe(t.subtotalMinor - (t.discountMinor ?? 0) + t.shipMinor + t.taxMinor + 3 * fee);

    const balance = (await storeBalance(buyer.db, 'US'))!;
    const after = await cancelOrderItems(buyer.db, order.id, [a]);
    expect(after.totals.wrapMinor).toBe(fee);
    const c = after.cancellations![0];
    expect(c.wrapMinor).toBe(2 * fee);
    expect(c.refund.amountMinor).toBe(c.itemsMinor + c.taxMinor + 2 * fee);
    expect(await storeBalance(buyer.db, 'US')).toBe(balance + c.refund.amountMinor);

    const total = (await getOrder(buyer.db, order.id))!.totals.totalMinor;
    const cancelled = await cancelOrder(buyer.db, order.id);
    expect(cancelled.refund).toMatchObject({ amountMinor: total });
    expect(await storeBalance(buyer.db, 'US')).toBe(balance + c.refund.amountMinor + total);
  });

  it('the API takes it too', async () => {
    await fill();
    const token = (await buyer.db.auth.getSession()).data.session!.access_token;
    const req = new NextRequest('http://localhost/api/v1/orders?market=US', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ paymentMethod: 'giftcard', shipping: US_SHIPPING, gift: { wrap: true } }),
    });
    const res = await POST(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    expect((await res.json()).order).toMatchObject({ gift: { wrapped: true }, totals: { wrapMinor: 3 * fee } });
  });
});
