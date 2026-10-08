import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { createCategory } from '@/lib/data/admin-categories';
import { storeBalance } from '@/lib/data/balance';
import { setCartQty } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { cancelOrder, cancelOrderItems, getOrder, payCodOrder, placeOrder } from '@/lib/data/orders';
import { admin, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, type TestUser } from './helpers';

/** What a call failed with, as `code:detail` (or 'no error'). */
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
  return 'no error';
};

const tag = crypto.randomUUID().slice(0, 6);
let boss: TestUser;
let shopper: TestUser;
let broke: TestUser;
let other: TestUser;
// the test's own amazon.in category and two products in it
let category = '';
let product = '';
let second = '';

const item = (priceMinor: number): ProductInput => ({
  title: `Pay now test ${tag}`,
  brand: null,
  category,
  image: '/products/placeholder.jpg',
  priceMinor,
  listMinor: null,
  deal: false,
  couponPct: null,
  maxPerCustomer: null,
  sizes: null,
  unit: null,
  qtyDiscount: null,
  releaseAt: null,
  badge: null,
  boughtPastMonth: null,
  seller: 'Test Seller',
  shipsFrom: 'Store',
  bullets: [],
  description: null,
  details: [],
  // under pickProduct's 25, so other tests never pick these
  stock: 20,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
});

const cod = (u: TestUser, productId = product) =>
  placeOrder(u.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId, qty: 1 } });

beforeAll(async () => {
  [boss, shopper, broke, other] = await Promise.all([
    newUser('Pay Now Admin'),
    newUser('Pay Now Shopper'),
    newUser('Pay Now Broke', { funded: false }),
    newUser('Pay Now Other'),
  ]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  category = await createCategory(boss.db, { name: `Pay now ${tag}` }, 'IN');
  product = await createProduct(boss.db, 'IN', item(219_900));
  second = await createProduct(boss.db, 'IN', item(99_900));
});

afterAll(async () => {
  // orders go with the shoppers, and then the products and the category can
  await Promise.all([deleteUser(shopper), deleteUser(broke), deleteUser(other)]);
  const ids = [product, second].filter(Boolean);
  if (ids.length) await admin().from('products').delete().in('id', ids);
  if (category) {
    await admin().from('market_categories').delete().eq('category_slug', category);
    await admin().from('categories').delete().eq('slug', category);
  }
  await deleteUser(boss);
});

describe('Pay now on Pay on Delivery orders', () => {
  it('pays by UPI, and a cancellation then refunds it', async () => {
    const o = await cod(shopper);
    expect(o).toMatchObject({ paymentMethod: 'cod' });
    expect(o.prepaidAt).toBeUndefined();

    const paid = await payCodOrder(shopper.db, o.id, 'upi');
    expect(paid).toMatchObject({ status: 'placed', paymentMethod: 'upi', paymentLabel: 'UPI' });
    expect(paid.prepaidAt).toBeTruthy();
    expect(await failure(payCodOrder(shopper.db, o.id, 'upi'))).toBe('order_not_payable:not_cod');

    const cancelled = await cancelOrder(shopper.db, o.id);
    expect(cancelled.refund).toMatchObject({ status: 'succeeded', amountMinor: o.totals.totalMinor });
    expect(await failure(payCodOrder(shopper.db, o.id, 'upi'))).toBe('order_not_payable:cancelled');
  });

  it('pays by net banking, naming the bank', async () => {
    const o = await cod(shopper);
    const paid = await payCodOrder(shopper.db, o.id, 'netbanking', '  HDFC Bank ');
    expect(paid).toMatchObject({ paymentMethod: 'netbanking', paymentLabel: 'Net banking · HDFC Bank', bank: 'HDFC Bank' });
    await cancelOrder(shopper.db, o.id);
  });

  it('pays from the balance, refused when it is short, and gives it back on cancelling', async () => {
    const short = await cod(broke);
    expect(await failure(payCodOrder(broke.db, short.id, 'amazonpay'))).toBe('insufficient_balance:');
    expect((await getOrder(broke.db, short.id))?.paymentMethod).toBe('cod');
    await cancelOrder(broke.db, short.id);

    const before = await storeBalance(shopper.db, 'IN');
    const o = await cod(shopper);
    const paid = await payCodOrder(shopper.db, o.id, 'amazonpay');
    expect(paid).toMatchObject({ paymentMethod: 'amazonpay', paymentLabel: 'Amazon Pay balance' });
    expect(await storeBalance(shopper.db, 'IN')).toBe(before! - o.totals.totalMinor);

    const cancelled = await cancelOrder(shopper.db, o.id);
    expect(cancelled.refund?.status).toBe('succeeded');
    expect(await storeBalance(shopper.db, 'IN')).toBe(before);
  });

  it('refunds what is left after items cancelled while it was on Pay on Delivery', async () => {
    // two lines from the cart: one cancelled while still on Pay on Delivery, then the rest paid and cancelled
    await shopper.db.rpc('cart_clear', { p_market: 'IN' });
    for (const id of [product, second]) await setCartQty(shopper.db, 'IN', id, 1);
    const both = await placeOrder(shopper.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING });
    expect(both.items).toHaveLength(2);
    const less = await cancelOrderItems(shopper.db, both.id, [second]);
    expect(less.cancellations?.[0].refund.status).toBe('not_charged');

    const paid = await payCodOrder(shopper.db, both.id, 'upi');
    expect(paid.totals.totalMinor).toBe(less.totals.totalMinor);
    const cancelled = await cancelOrder(shopper.db, paid.id);
    expect(cancelled.refund).toMatchObject({ status: 'succeeded', amountMinor: less.totals.totalMinor });
  });

  it('is refused once delivered, for another method, and for someone else’s order', async () => {
    const o = await cod(shopper);
    expect(await failure(payCodOrder(shopper.db, o.id, 'card'))).toBe('invalid_input:method');
    expect(await failure(payCodOrder(shopper.db, o.id, 'netbanking', 'x'.repeat(41)))).toBe('invalid_input:bank');
    expect(await failure(payCodOrder(other.db, o.id, 'upi'))).toBe('order_not_found:');

    await deliveredDaysAgo(o.id);
    expect(await failure(payCodOrder(shopper.db, o.id, 'upi'))).toBe('order_not_payable:delivered');
    expect((await getOrder(shopper.db, o.id))?.paymentMethod).toBe('cod');

    const upi = await placeOrder(shopper.db, 'IN', { paymentMethod: 'upi', shipping: IN_SHIPPING, buyNow: { productId: product, qty: 1 } });
    expect(await failure(payCodOrder(shopper.db, upi.id, 'upi'))).toBe('order_not_payable:not_cod');
    await cancelOrder(shopper.db, upi.id);
  });

  it('is served at POST /orders/:id/pay-now', async () => {
    const route = await import('@/app/api/v1/orders/[id]/pay-now/route');
    const token = (await shopper.db.auth.getSession()).data.session!.access_token;
    const headers = { authorization: `Bearer ${token}`, 'x-market': 'IN', 'content-type': 'application/json' };
    const post = (id: string, body: unknown) =>
      route.POST(new NextRequest(`http://localhost/api/v1/orders/${id}/pay-now`, { method: 'POST', headers, body: JSON.stringify(body) }), {
        params: Promise.resolve({ id }),
      });

    const o = await cod(shopper);
    expect((await post(o.id, { method: 'card' })).status).toBe(422);
    const res = await post(o.id, { method: 'netbanking', bank: 'ICICI Bank' });
    expect(res.status).toBe(200);
    const { order } = (await res.json()) as { order: { paymentMethod: string; paymentLabel: string; prepaidAt?: string } };
    expect(order).toMatchObject({ paymentMethod: 'netbanking', paymentLabel: 'Net banking · ICICI Bank' });
    expect(order.prepaidAt).toBeTruthy();
    expect((await post(o.id, { method: 'upi' })).status).toBe(409);
    await cancelOrder(shopper.db, o.id);
  });
});
