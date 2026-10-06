import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addToCart, buyNowQuote, getCart } from '@/lib/data/cart';
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

describe('buy now', () => {
  let shopper: TestUser;
  let fresh: TestUser;
  let inCart: { id: string; price_minor: number; stock: number };
  let buy: { id: string; price_minor: number; stock: number };
  beforeAll(async () => {
    [shopper, fresh] = await Promise.all([newUser('Quick Buyer'), newUser('Empty Cart')]);
    [inCart, buy] = await Promise.all([pickProduct('US', 44), pickProduct('US', 45)]);
    await addToCart(shopper.db, 'US', inCart.id, 2);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(shopper), deleteUser(fresh)]);
  });

  const cartLines = async () => (await getCart(shopper.db, 'US')).lines.map((l) => [l.product.id, l.qty]);

  it('quotes just the one product, priced like a cart of it', async () => {
    const quote = await buyNowQuote(shopper.db, 'US', buy.id, 3);
    expect(quote.lines.map((l) => [l.product.id, l.qty])).toEqual([[buy.id, 3]]);
    expect(quote.count).toBe(3);
    const { data } = await anon().rpc('order_totals', { p_market: 'US', p_subtotal: buy.price_minor * 3 });
    expect(quote.totals).toMatchObject({ subtotalMinor: buy.price_minor * 3, shipMinor: data![0].ship_minor, taxMinor: data![0].tax_minor, totalMinor: data![0].total_minor });
    // 1 up to the store's line limit
    expect((await buyNowQuote(shopper.db, 'US', buy.id, 999)).lines[0].qty).toBe(30);
    expect((await buyNowQuote(shopper.db, 'US', buy.id, -2)).lines[0].qty).toBe(1);
    expect(await cartLines()).toEqual([[inCart.id, 2]]);
  });

  it('only for this store’s products, and only signed in', async () => {
    const india = await pickProduct('IN', 0);
    expect(await code(buyNowQuote(shopper.db, 'US', india.id, 1))).toBe('product_not_found');
    expect(await code(buyNowQuote(shopper.db, 'US', 'no-such-product', 1))).toBe('product_not_found');
    const guest = await anon().rpc('buy_now_quote', { p_market: 'US', p_product: buy.id, p_qty: 1 });
    expect(guest.error).not.toBeNull();
  });

  it('orders just that product and leaves the cart as it was', async () => {
    const before = await stockOf(buy.id);
    const order = await placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, buyNow: { productId: buy.id, qty: 2 } });
    expect(order.status).toBe('placed');
    expect(order.items.map((i) => [i.productId, i.qty])).toEqual([[buy.id, 2]]);
    expect(order.totals.subtotalMinor).toBe(buy.price_minor * 2);
    expect(await stockOf(buy.id)).toBe(before - 2);
    expect(await cartLines()).toEqual([[inCart.id, 2]]);
    const { data } = await admin().from('orders').select('from_cart').eq('id', order.id).single();
    expect(data!.from_cart).toBe(false);
  });

  it('needs no cart at all', async () => {
    expect(await code(placeOrder(fresh.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING }))).toBe('cart_empty');
    const order = await placeOrder(fresh.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, buyNow: { productId: buy.id, qty: 1 } });
    expect(order.items).toHaveLength(1);
  });

  it('checks stock like any order', async () => {
    const stock = await stockOf(buy.id);
    await setStock(buy.id, 1);
    try {
      expect(await code(placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, buyNow: { productId: buy.id, qty: 2 } }))).toBe('insufficient_stock');
    } finally {
      await setStock(buy.id, stock);
    }
  });

  it('a paid Buy Now card order doesn’t take anything out of the cart', async () => {
    // the same product is in the cart too: paying for Buy Now must leave that line alone
    await addToCart(shopper.db, 'US', buy.id, 1);
    const order = await placeOrder(shopper.db, 'US', { paymentMethod: 'card', shipping: US_SHIPPING, buyNow: { productId: buy.id, qty: 1 } });
    expect(order.status).toBe('awaiting_payment');
    const { error } = await admin().rpc('confirm_order_payment', {
      p_order_id: order.id,
      p_session_id: `cs_test_${crypto.randomUUID()}`,
      p_amount_minor: order.totals.totalMinor,
      p_currency: order.currency,
      p_payment_label: 'Visa ending 4242',
    });
    expect(error).toBeNull();
    expect(await cartLines()).toEqual([[inCart.id, 2], [buy.id, 1]]);
  });

  it('checking out the cart still empties it', async () => {
    const order = await placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
    expect(order.items.map((i) => i.productId)).toEqual([inCart.id, buy.id]);
    expect(await cartLines()).toEqual([]);
    const { data } = await admin().from('orders').select('from_cart').eq('id', order.id).single();
    expect(data!.from_cart).toBe(true);
  });
});
