import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataError } from '@/lib/data/errors';
import { getOrder, placeOrder, setOrderGst } from '@/lib/data/orders';
import type { Order } from '@/lib/types';
import { admin, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

/** What a call failed with, as `code:detail` (or 'no error'). */
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
  return 'no error';
};

const ACME = { gstin: '27AAPFU0939F1ZV', name: 'Acme Traders' };

let buyer: TestUser;
let other: TestUser;
let product: string;
let usProduct: string;
let order: Order;

beforeAll(async () => {
  // high in each store's pool, apart from other tests' products
  const [p, us] = await Promise.all([pickProduct('IN', 119), pickProduct('US', 113)]);
  [product, usProduct] = [p.id, us.id];
  [buyer, other] = await Promise.all([newUser('GST Buyer'), newUser('GST Stranger')]);
});

afterAll(async () => {
  await Promise.all([deleteUser(buyer), deleteUser(other)]);
});

describe('GST invoices', () => {
  it('checkout makes the order out to the business', async () => {
    order = await placeOrder(buyer.db, 'IN', {
      paymentMethod: 'amazonpay',
      shipping: IN_SHIPPING,
      buyNow: { productId: product, qty: 1 },
      gst: { gstin: ' 27aapfu0939f1zv ', name: '  Acme   Traders ' },
    });
    expect(order).toMatchObject({ status: 'placed', gst: ACME });
    expect((await getOrder(buyer.db, order.id))?.gst).toEqual(ACME);
  });

  it('the database checks the GSTIN and the name too', async () => {
    const call = (gstin: string, name: string) => buyer.db.rpc('set_order_gst', { p_order_id: order.id, p_gstin: gstin, p_name: name });
    expect((await call('27AAPFU0939F1ZW', 'Acme')).error).toMatchObject({ message: 'invalid_input', details: 'gstin' });
    expect((await call('00AAPFU0939F1ZV', 'Acme')).error).toMatchObject({ message: 'invalid_input', details: 'gstin' });
    expect((await call('27AAPFU0939F1ZV', '   ')).error).toMatchObject({ message: 'invalid_input', details: 'gst_name' });
    expect((await call('27AAPFU0939F1ZV', 'x'.repeat(101))).error).toMatchObject({ message: 'invalid_input', details: 'gst_name' });
    // both or neither, whoever writes it
    const half = await admin().from('orders').update({ gst_name: null }).eq('id', order.id);
    expect(half.error).toBeTruthy();
    // and shoppers can't write it straight onto the order
    await buyer.db.from('orders').update({ gstin: '29AAGCB7383J1Z4' }).eq('id', order.id);
    expect((await getOrder(buyer.db, order.id))?.gst).toEqual(ACME);
  });

  it('changes or comes off while the order is being prepared, not once it ships', async () => {
    expect((await setOrderGst(buyer.db, order.id, '29AAGCB7383J1Z4', 'Beta Labs')).gst).toEqual({ gstin: '29AAGCB7383J1Z4', name: 'Beta Labs' });
    expect((await setOrderGst(buyer.db, order.id, '', '')).gst).toBeUndefined();
    expect((await setOrderGst(buyer.db, order.id, ACME.gstin, ACME.name)).gst).toEqual(ACME);
    await deliveredDaysAgo(order.id, 1);
    expect(await failure(setOrderGst(buyer.db, order.id, '', ''))).toBe('gst_locked:');
    expect((await getOrder(buyer.db, order.id))?.gst).toEqual(ACME);
  });

  it('only the owner, and only in India', async () => {
    expect(await failure(setOrderGst(other.db, order.id, ACME.gstin, ACME.name))).toBe('order_not_found:');
    const us = await placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, buyNow: { productId: usProduct, qty: 1 } });
    expect(await failure(setOrderGst(buyer.db, us.id, ACME.gstin, ACME.name))).toBe('gst_unavailable:');
    expect(await failure(placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, buyNow: { productId: usProduct, qty: 1 }, gst: ACME }))).toBe(
      'gst_unavailable:',
    );
  });
});
