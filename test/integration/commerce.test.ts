import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addToCart, getCart, mergeGuestCart, setCartQty } from '@/lib/data/cart';
import { cancelPendingOrder, getOrder, listOrders, placeOrder } from '@/lib/data/orders';
import { DataError } from '@/lib/data/errors';
import { toOrder } from '@/lib/data/map';
import { admin, anon, deleteUser, IN_SHIPPING, newUser, pickProduct, setStock, stockOf, US_SHIPPING, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('totals', () => {
  it('US: 8% tax on top, free shipping from $35', async () => {
    const { data } = await anon().rpc('order_totals', { p_market: 'US', p_subtotal: 3000 });
    expect(data![0]).toEqual({ subtotal_minor: 3000, ship_minor: 599, tax_minor: 240, total_minor: 3839 });
    const free = await anon().rpc('order_totals', { p_market: 'US', p_subtotal: 3500 });
    expect(free.data![0]).toMatchObject({ ship_minor: 0, tax_minor: 280, total_minor: 3780 });
  });

  it('IN: prices include tax, free delivery from ₹499', async () => {
    const { data } = await anon().rpc('order_totals', { p_market: 'IN', p_subtotal: 30000 });
    expect(data![0]).toEqual({ subtotal_minor: 30000, ship_minor: 4000, tax_minor: 0, total_minor: 34000 });
  });
});

describe('guest cart', () => {
  it('prices lines from the catalog and caps quantity at 30 and at stock', async () => {
    const db = anon();
    const token = crypto.randomUUID();
    const p = await pickProduct('US', 0);
    let cart = await addToCart(db, 'US', p.id, 2, token);
    expect(cart.count).toBe(2);
    expect(cart.lines[0].lineTotalMinor).toBe(p.price_minor * 2);
    expect(cart.currency).toBe('USD');

    cart = await setCartQty(db, 'US', p.id, 99, token);
    expect(cart.lines[0].qty).toBe(Math.min(30, p.stock));

    cart = await setCartQty(db, 'US', p.id, 0, token);
    expect(cart.lines).toHaveLength(0);
  });

  it('keeps stores apart and refuses sold-out items', async () => {
    const db = anon();
    const token = crypto.randomUUID();
    const us = await pickProduct('US', 1);
    expect(await code(addToCart(db, 'IN', us.id, 1, token))).toBe('product_not_found');

    await setStock(us.id, 0);
    try {
      expect(await code(addToCart(db, 'US', us.id, 1, token))).toBe('out_of_stock');
    } finally {
      await setStock(us.id, us.stock);
    }
  });

  it('a token only ever sees its own cart', async () => {
    const db = anon();
    const a = crypto.randomUUID();
    const p = await pickProduct('US', 2);
    await addToCart(db, 'US', p.id, 1, a);
    expect((await getCart(db, 'US', crypto.randomUUID())).lines).toHaveLength(0);
    // and the tables themselves are closed to direct reads
    const direct = await db.from('carts').select('*');
    expect(direct.data ?? []).toHaveLength(0);
  });
});

describe('checkout', () => {
  let buyer: TestUser;
  let other: TestUser;
  beforeAll(async () => {
    [buyer, other] = await Promise.all([newUser('Buyer One'), newUser('Other Person')]);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(buyer), deleteUser(other)]);
  });

  it('merges the guest cart into the account on sign-in', async () => {
    const token = crypto.randomUUID();
    const p = await pickProduct('US', 3);
    await addToCart(anon(), 'US', p.id, 2, token);
    expect(await mergeGuestCart(buyer.db, token)).toBe(1);
    const cart = await getCart(buyer.db, 'US');
    expect(cart.lines.find((l) => l.product.id === p.id)?.qty).toBe(2);
    // the guest cart is gone
    expect((await getCart(anon(), 'US', token)).lines).toHaveLength(0);
    await setCartQty(buyer.db, 'US', p.id, 0);
  });

  it('places a non-card order: stock reserved, totals from the DB, cart emptied', async () => {
    const p = await pickProduct('US', 4);
    const before = await stockOf(p.id);
    await addToCart(buyer.db, 'US', p.id, 3);
    const order = await placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });

    expect(order.status).toBe('placed');
    expect(order.id).toMatch(/^114-\d{7}-\d{7}$/);
    expect(order.items).toEqual([expect.objectContaining({ productId: p.id, qty: 3, unitPriceMinor: p.price_minor })]);
    const { data } = await anon().rpc('order_totals', { p_market: 'US', p_subtotal: p.price_minor * 3 });
    expect(order.totals).toEqual({
      subtotalMinor: data![0].subtotal_minor,
      // nothing clipped
      discountMinor: 0,
      shipMinor: data![0].ship_minor,
      taxMinor: data![0].tax_minor,
      totalMinor: data![0].total_minor,
    });
    expect(await stockOf(p.id)).toBe(before - 3);
    expect((await getCart(buyer.db, 'US')).lines).toHaveLength(0);
    expect((await listOrders(buyer.db, 'US')).map((o) => o.id)).toContain(order.id);
  });

  it('orders are private to their owner', async () => {
    const [mine] = await listOrders(buyer.db, 'US');
    expect(mine).toBeDefined();
    expect(await getOrder(other.db, mine.id)).toBeNull();
    expect(await listOrders(other.db, 'US')).toHaveLength(0);
    const asAnon = await anon().from('orders').select('id');
    expect(asAnon.data ?? []).toHaveLength(0);
    // nobody writes orders directly
    const forged = await buyer.db.from('orders').update({ total_minor: 1 }).eq('id', mine.id).select('id');
    expect(forged.error ?? (forged.data?.length === 0 ? 'no rows' : null)).toBeTruthy();
  });

  it('refuses to oversell', async () => {
    const p = await pickProduct('US', 5);
    await addToCart(buyer.db, 'US', p.id, 5);
    await setStock(p.id, 2);
    try {
      expect(await code(placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING }))).toBe('insufficient_stock');
      expect(await stockOf(p.id)).toBe(2);
    } finally {
      await setStock(p.id, p.stock);
      await setCartQty(buyer.db, 'US', p.id, 0);
    }
  });

  it('validates the address and payment method per store', async () => {
    const p = await pickProduct('IN', 0);
    await addToCart(buyer.db, 'IN', p.id, 1);
    expect(await code(placeOrder(buyer.db, 'IN', { paymentMethod: 'giftcard', shipping: IN_SHIPPING }))).toBe('payment_method_unavailable');
    expect(await code(placeOrder(buyer.db, 'IN', { paymentMethod: 'cod', shipping: { ...IN_SHIPPING, postcode: '98109' } }))).toBe('invalid_input');
    const order = await placeOrder(buyer.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING });
    expect(order).toMatchObject({ status: 'placed', currency: 'INR', paymentLabel: 'Cash on Delivery' });
    expect(order.id.startsWith('402-')).toBe(true);
  });

  it('card orders wait for payment; only the service role can confirm, and only for the exact amount', async () => {
    const p = await pickProduct('US', 6);
    const before = await stockOf(p.id);
    await addToCart(buyer.db, 'US', p.id, 1);
    const order = await placeOrder(buyer.db, 'US', { paymentMethod: 'card', shipping: US_SHIPPING });
    expect(order.status).toBe('awaiting_payment');
    expect(await stockOf(p.id)).toBe(before - 1); // reserved
    expect((await getCart(buyer.db, 'US')).lines).toHaveLength(1); // kept until paid

    const confirm = (amount: number, db = admin()) =>
      db.rpc('confirm_order_payment', {
        p_order_id: order.id,
        p_session_id: 'cs_test_fake',
        p_amount_minor: amount,
        p_currency: 'usd',
        p_payment_label: 'Visa ending 4242',
      });

    // customers cannot mark their own order paid
    const self = await confirm(order.totals.totalMinor, buyer.db as never);
    expect(self.error).not.toBeNull();
    // the amount has to match
    expect((await confirm(order.totals.totalMinor - 1)).error?.message).toBe('amount_mismatch');

    const ok = await confirm(order.totals.totalMinor);
    expect(ok.error).toBeNull();
    const paid = toOrder(ok.data as never);
    expect(paid).toMatchObject({ status: 'placed', paymentLabel: 'Visa ending 4242' });
    expect((await getCart(buyer.db, 'US')).lines).toHaveLength(0);

    // idempotent: a second confirmation changes nothing
    const again = await confirm(order.totals.totalMinor);
    expect(toOrder(again.data as never).status).toBe('placed');
    expect(await stockOf(p.id)).toBe(before - 1);
  });

  it('abandoning a card checkout releases the reserved stock and keeps the cart', async () => {
    const p = await pickProduct('US', 7);
    const before = await stockOf(p.id);
    await addToCart(buyer.db, 'US', p.id, 2);
    const order = await placeOrder(buyer.db, 'US', { paymentMethod: 'card', shipping: US_SHIPPING });
    expect(await stockOf(p.id)).toBe(before - 2);

    expect(await code(cancelPendingOrder(other.db, order.id))).toBe('order_not_found');
    const cancelled = await cancelPendingOrder(buyer.db, order.id);
    expect(cancelled.status).toBe('cancelled');
    expect(await stockOf(p.id)).toBe(before);
    expect((await getCart(buyer.db, 'US')).lines.map((l) => l.product.id)).toContain(p.id);
    await setCartQty(buyer.db, 'US', p.id, 0);
  });

  it('customers cannot change prices or stock', async () => {
    const p = await pickProduct('US', 8);
    await buyer.db.from('products').update({ price_minor: 1, stock: 99999 }).eq('id', p.id);
    const { data } = await admin().from('products').select('price_minor, stock').eq('id', p.id).single();
    expect(data).toEqual({ price_minor: p.price_minor, stock: p.stock });
  });
});

describe('gift orders', () => {
  let shopper: TestUser;
  const shipping = {
    full_name: US_SHIPPING.fullName,
    phone: US_SHIPPING.phone,
    line1: US_SHIPPING.line1,
    city: US_SHIPPING.city,
    state: US_SHIPPING.state,
    postcode: US_SHIPPING.postcode,
  };
  const placeRaw = async (args: { p_gift?: boolean; p_gift_message?: string }) => {
    const { data, error } = await shopper.db.rpc('place_order', { p_market: 'US', p_payment_method: 'giftcard', p_shipping: shipping, ...args });
    if (error) throw error;
    return toOrder(data as unknown as Parameters<typeof toOrder>[0]);
  };

  beforeAll(async () => {
    shopper = await newUser('Gift Giver');
  });
  afterAll(async () => {
    await deleteUser(shopper);
  });

  it('a gift order keeps its note', async () => {
    const p = await pickProduct('US', 9);
    await addToCart(shopper.db, 'US', p.id, 1);
    const order = await placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, gift: { message: 'Happy birthday!\nLove, Sam' } });
    expect(order.gift).toEqual({ message: 'Happy birthday!\nLove, Sam' });
    expect((await getOrder(shopper.db, order.id))?.gift).toEqual({ message: 'Happy birthday!\nLove, Sam' });
  });

  it('the database trims the note to 240 characters and drops one sent without the gift flag', async () => {
    const p = await pickProduct('US', 9);
    await addToCart(shopper.db, 'US', p.id, 1);
    expect((await placeRaw({ p_gift: true, p_gift_message: `  ${'x'.repeat(300)}` })).gift?.message).toHaveLength(240);
    await addToCart(shopper.db, 'US', p.id, 1);
    expect((await placeRaw({ p_gift: true, p_gift_message: '   ' })).gift).toEqual({});
    await addToCart(shopper.db, 'US', p.id, 1);
    expect((await placeRaw({ p_gift_message: 'stray' })).gift).toBeUndefined();
  });

  it('customers cannot add a note to an order afterwards', async () => {
    const [mine] = await listOrders(shopper.db, 'US');
    const forged = await shopper.db.from('orders').update({ gift_message: 'changed' }).eq('id', mine.id).select('id');
    expect(forged.error ?? (forged.data?.length === 0 ? 'no rows' : null)).toBeTruthy();
  });
});
