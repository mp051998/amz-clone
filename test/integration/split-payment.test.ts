import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { createCategory } from '@/lib/data/admin-categories';
import { receiveReturn } from '@/lib/data/admin-returns';
import { storeBalance } from '@/lib/data/balance';
import { setCartQty } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { cancelPendingOrder, getOrder, placeOrder } from '@/lib/data/orders';
import { requestReturn } from '@/lib/data/returns';
import type { Market, Order } from '@/lib/types';
import { admin, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, US_SHIPPING, type TestUser } from './helpers';

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
let buyer: TestUser;
const categories: string[] = [];
const products: string[] = [];
// amazon.com: a $50 and a $20 item; amazon.in: a ₹499 one
let [pBig, pSmall, pIn] = ['', '', ''];

const product = (category: string, priceMinor: number): ProductInput => ({
  title: `Split payment test ${tag}`,
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
  seller: 'Test Seller',
  shipsFrom: 'Store',
  bullets: [],
  description: null,
  details: [],
  // under pickProduct's 25, so other tests never pick these
  stock: 10,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
});

/** Sets the buyer's balance in a store (service role; shoppers can't). */
async function setBalance(market: Market, balanceMinor: number) {
  const { error } = await admin().from('store_balances').upsert({ user_id: buyer.id, market_id: market, balance_minor: balanceMinor });
  if (error) throw error;
}

/** Stripe's payment landing for `amountMinor` (as the webhook records it). */
const confirm = (order: Order, amountMinor: number) =>
  admin().rpc('confirm_order_payment', {
    p_order_id: order.id,
    p_session_id: `cs_test_${order.id}`,
    p_amount_minor: amountMinor,
    p_currency: order.currency,
    p_payment_label: 'Visa ending 4242',
  });

const balanceEntries = async (orderId: string) =>
  (await admin().from('balance_entries').select('kind, amount_minor').eq('order_id', orderId).order('id')).data ?? [];

beforeAll(async () => {
  [boss, buyer] = await Promise.all([newUser('Split Admin'), newUser('Split Buyer', { funded: false })]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  const us = await createCategory(boss.db, { name: `Split US ${tag}` }, 'US');
  const ind = await createCategory(boss.db, { name: `Split IN ${tag}` }, 'IN');
  categories.push(us, ind);
  pBig = await createProduct(boss.db, 'US', product(us, 5000));
  pSmall = await createProduct(boss.db, 'US', product(us, 2000));
  pIn = await createProduct(boss.db, 'IN', product(ind, 49_900));
  products.push(pBig, pSmall, pIn);
});

afterAll(async () => {
  await Promise.all([deleteUser(buyer), deleteUser(boss)]);
  if (products.length) await admin().from('products').delete().in('id', products);
  if (categories.length) {
    await admin().from('market_categories').delete().in('category_slug', categories);
    await admin().from('categories').delete().in('slug', categories);
  }
});

describe('paying part of an order from the balance', () => {
  it('takes the balance at once and asks the card for the rest; refunds go to the card first', async () => {
    await setBalance('US', 3000);
    await buyer.db.rpc('cart_clear', { p_market: 'US' });
    await setCartQty(buyer.db, 'US', pBig, 1);
    await setCartQty(buyer.db, 'US', pSmall, 1);
    const order = await placeOrder(buyer.db, 'US', { paymentMethod: 'card', shipping: US_SHIPPING, useBalance: true });
    const charged = order.totals.totalMinor - 3000;
    expect(order.status).toBe('awaiting_payment');
    expect(order.split).toEqual({ balanceMinor: 3000, chargedMinor: charged });
    expect(await storeBalance(buyer.db, 'US')).toBe(0);
    expect(await balanceEntries(order.id)).toEqual([{ kind: 'order', amount_minor: -3000 }]);

    // Stripe charges the card part only
    expect((await confirm(order, order.totals.totalMinor)).error?.message).toBe('amount_mismatch');
    const paid = await confirm(order, charged);
    expect(paid.error).toBeNull();
    expect((paid.data as { status: string }).status).toBe('placed');

    // the $20 item's refund fits in what the card paid
    expect((await buyer.db.rpc('cancel_my_items', { p_order_id: order.id, p_product_ids: [pSmall] })).error).toBeNull();
    const partly = (await getOrder(buyer.db, order.id))!;
    const items = partly.cancellations![0].refund;
    expect(items.amountMinor).toBeGreaterThan(0);
    expect(items.amountMinor).toBeLessThanOrEqual(charged);
    expect(items.balanceMinor).toBeUndefined();
    expect(items.status).toBe('pending');
    expect(partly.split).toEqual({ balanceMinor: 3000, chargedMinor: charged });
    expect(await storeBalance(buyer.db, 'US')).toBe(0);

    // the rest: what's left of the card's part, then the balance's back in full
    expect((await buyer.db.rpc('cancel_my_order', { p_order_id: order.id })).error).toBeNull();
    const cancelled = (await getOrder(buyer.db, order.id))!;
    expect(cancelled.refund).toMatchObject({ status: 'pending', amountMinor: charged - items.amountMinor + 3000, balanceMinor: 3000 });
    expect(await storeBalance(buyer.db, 'US')).toBe(3000);
    expect(await balanceEntries(order.id)).toEqual([
      { kind: 'order', amount_minor: -3000 },
      { kind: 'refund', amount_minor: 3000 },
    ]);
  });

  it('an abandoned checkout gives its balance part back', async () => {
    await setBalance('US', 3000);
    const order = await placeOrder(buyer.db, 'US', { paymentMethod: 'card', shipping: US_SHIPPING, useBalance: true, buyNow: { productId: pBig, qty: 1 } });
    expect(order.split?.balanceMinor).toBe(3000);
    expect(await storeBalance(buyer.db, 'US')).toBe(0);
    expect((await cancelPendingOrder(buyer.db, order.id)).status).toBe('cancelled');
    expect(await storeBalance(buyer.db, 'US')).toBe(3000);
  });

  it('is turned down when the balance covers it all, and with methods that don’t combine', async () => {
    await setBalance('US', 1_000_000);
    const buy = { productId: pBig, qty: 1 };
    expect(await failure(placeOrder(buyer.db, 'US', { paymentMethod: 'card', shipping: US_SHIPPING, useBalance: true, buyNow: buy }))).toBe(
      'balance_covers_order:',
    );
    expect(await storeBalance(buyer.db, 'US')).toBe(1_000_000);
    expect(await failure(placeOrder(buyer.db, 'US', { paymentMethod: 'cod', shipping: US_SHIPPING, useBalance: true, buyNow: buy }))).toBe(
      'invalid_input:useBalance',
    );
    // paying with the balance method already uses it all
    const whole = await placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, useBalance: true, buyNow: buy });
    expect(whole.split).toBeUndefined();
    expect(await storeBalance(buyer.db, 'US')).toBe(1_000_000 - whole.totals.totalMinor);
  });

  it('a UPI order is placed at once; its returns refund UPI first, then the balance', async () => {
    await setBalance('IN', 50_000);
    const order = await placeOrder(buyer.db, 'IN', { paymentMethod: 'upi', shipping: IN_SHIPPING, useBalance: true, buyNow: { productId: pIn, qty: 2 } });
    const charged = order.totals.totalMinor - 50_000;
    expect(order.status).toBe('placed');
    expect(order.split).toEqual({ balanceMinor: 50_000, chargedMinor: charged });
    expect(await storeBalance(buyer.db, 'IN')).toBe(0);
    await deliveredDaysAgo(order.id, 1);

    let toUpi = 0;
    let toBalance = 0;
    for (let i = 0; i < 2; i++) {
      const r = await requestReturn(buyer.db, order.id, { items: [{ productId: pIn, qty: 1 }], reason: 'no_longer_needed', refundTo: 'original' });
      await receiveReturn(boss.db, r.id);
      const row = (await admin().from('returns').select('refund_minor, balance_refund_minor, refund_status').eq('id', r.id).single()).data!;
      // what UPI hasn't paid back yet comes first
      const share = Math.min(row.refund_minor, Math.max(toUpi + row.refund_minor - charged, 0));
      expect(row.balance_refund_minor).toBe(share);
      if (share === row.refund_minor) expect(row.refund_status).toBe('succeeded');
      toUpi += row.refund_minor - share;
      toBalance += share;
    }
    expect(toUpi).toBeLessThanOrEqual(charged);
    expect(toBalance).toBeGreaterThan(0);
    expect(await storeBalance(buyer.db, 'IN')).toBe(toBalance);
  });
});
