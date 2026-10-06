import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addToCart, getCart, selectCartLines } from '@/lib/data/cart';
import { placeOrder } from '@/lib/data/orders';
import { DataError } from '@/lib/data/errors';
import { admin, anon, deleteUser, newUser, pickProduct, setStock, stockOf, US_SHIPPING, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('ticking cart lines for checkout', () => {
  let shopper: TestUser;
  let a: { id: string; price_minor: number; stock: number };
  let b: { id: string; price_minor: number; stock: number };
  let c: { id: string; price_minor: number; stock: number };
  beforeAll(async () => {
    shopper = await newUser('Picky Shopper');
    [a, b, c] = await Promise.all([pickProduct('US', 46), pickProduct('US', 47), pickProduct('US', 48)]);
  });
  afterAll(async () => {
    await deleteUser(shopper);
  });

  const lines = async () => (await getCart(shopper.db, 'US')).lines.map((l) => [l.product.id, l.qty, l.selected]);

  it('lines go in ticked; an unticked line stays listed but out of the subtotal', async () => {
    await addToCart(shopper.db, 'US', a.id, 2);
    const both = await addToCart(shopper.db, 'US', b.id, 1);
    expect(both.lines.map((l) => l.selected)).toEqual([true, true]);
    expect([both.count, both.selectedCount]).toEqual([3, 3]);

    const cart = await selectCartLines(shopper.db, 'US', b.id, false);
    expect(cart.lines.map((l) => [l.product.id, l.selected])).toEqual([[a.id, true], [b.id, false]]);
    expect([cart.count, cart.selectedCount]).toEqual([3, 2]);
    expect(cart.totals.subtotalMinor).toBe(a.price_minor * 2);
    const { data } = await anon().rpc('order_totals', { p_market: 'US', p_subtotal: a.price_minor * 2 });
    expect(cart.totals).toMatchObject({ shipMinor: data![0].ship_minor, taxMinor: data![0].tax_minor, totalMinor: data![0].total_minor });
  });

  it('all at once, and nothing ticked means nothing to check out', async () => {
    const none = await selectCartLines(shopper.db, 'US', null, false);
    expect(none.lines.map((l) => l.selected)).toEqual([false, false]);
    expect(none.selectedCount).toBe(0);
    expect(none.totals).toMatchObject({ subtotalMinor: 0, shipMinor: 0, taxMinor: 0, totalMinor: 0 });
    expect(await code(placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING }))).toBe('nothing_selected');

    const all = await selectCartLines(shopper.db, 'US', null, true);
    expect(all.selectedCount).toBe(3);
  });

  it('only a line that’s in the cart', async () => {
    expect(await code(selectCartLines(shopper.db, 'US', c.id, false))).toBe('not_in_cart');
  });

  it('checkout orders the ticked lines; the rest wait in the cart, and an unticked sold-out one doesn’t block it', async () => {
    await selectCartLines(shopper.db, 'US', a.id, false);
    const stock = await stockOf(a.id);
    await setStock(a.id, 0);
    try {
      const order = await placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
      expect(order.items.map((i) => [i.productId, i.qty])).toEqual([[b.id, 1]]);
      expect(order.totals.subtotalMinor).toBe(b.price_minor);
      // numbered from 1 among what was ordered (b was the cart's second line)
      const { data } = await admin().from('order_items').select('line_no').eq('order_id', order.id);
      expect(data!.map((r) => r.line_no)).toEqual([1]);
    } finally {
      await setStock(a.id, stock);
    }
    expect(await lines()).toEqual([[a.id, 2, false]]);
  });

  it('adding a product ticks its line again; changing a quantity doesn’t', async () => {
    const added = await addToCart(shopper.db, 'US', a.id, 1);
    expect(added.lines.map((l) => [l.product.id, l.qty, l.selected])).toEqual([[a.id, 3, true]]);
    await selectCartLines(shopper.db, 'US', a.id, false);
    const { error } = await shopper.db.rpc('cart_set_qty', { p_market: 'US', p_product_id: a.id, p_qty: 1, p_mode: 'set' });
    expect(error).toBeNull();
    expect(await lines()).toEqual([[a.id, 1, false]]);
  });

  it('a paid card order takes only its own lines out of the cart', async () => {
    await addToCart(shopper.db, 'US', c.id, 1);
    const order = await placeOrder(shopper.db, 'US', { paymentMethod: 'card', shipping: US_SHIPPING });
    expect(order.items.map((i) => i.productId)).toEqual([c.id]);
    const { error } = await admin().rpc('confirm_order_payment', {
      p_order_id: order.id,
      p_session_id: `cs_test_${crypto.randomUUID()}`,
      p_amount_minor: order.totals.totalMinor,
      p_currency: order.currency,
      p_payment_label: 'Visa ending 4242',
    });
    expect(error).toBeNull();
    expect(await lines()).toEqual([[a.id, 1, false]]);
  });

  it('guest carts tick with their token; without one there is no cart to tick', async () => {
    const guest = anon();
    const token = crypto.randomUUID();
    await addToCart(guest, 'US', a.id, 1, token);
    const cart = await selectCartLines(guest, 'US', a.id, false, token);
    expect([cart.count, cart.selectedCount]).toEqual([1, 0]);
    expect(await code(selectCartLines(guest, 'US', null, true))).toBe('cart_token_required');
    await admin().from('carts').delete().eq('guest_token', token);
  });
});
