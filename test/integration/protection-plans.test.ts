import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addToCart, buyNowQuote, getCart, mergeGuestCart, protectionOffer, selectCartLines, setCartProtection, setCartQty } from '@/lib/data/cart';
import { storeBalance } from '@/lib/data/balance';
import { DataError } from '@/lib/data/errors';
import { cancelOrderItems, placeOrder } from '@/lib/data/orders';
import { PATCH } from '@/app/api/v1/cart/items/[productId]/route';
import { admin, anon, deleteUser, IN_SHIPPING, newUser, US_SHIPPING, type TestUser } from './helpers';

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}${err.detail ? `:${err.detail}` : ''}` : String(err);
  }
  return 'no error';
};

/**
 * This file's products: the first the store covers and the first it doesn't, among
 * pickProduct()'s list (by id, 25+ in stock) at offsets US 87–99 and IN 55–69.
 */
async function pick(market: 'US' | 'IN', from: number, to: number) {
  const { data, error } = await admin()
    .from('products')
    .select('id, price_minor, category_slug')
    .eq('market_id', market)
    .gte('stock', 25)
    .order('id')
    .range(from, to);
  if (error) throw error;
  const offers = await Promise.all(data.map((p) => protectionOffer(anon(), p.id)));
  const covered = data.findIndex((_, i) => offers[i] != null);
  const uncovered = data.findIndex((_, i) => offers[i] == null);
  if (covered < 0 || uncovered < 0) throw new Error(`no covered and uncovered ${market} products at offsets ${from}–${to}`);
  return { covered: { ...data[covered], plan: offers[covered]! }, uncovered: data[uncovered] };
}

let buyer: TestUser;
let us: Awaited<ReturnType<typeof pick>>;
let india: Awaited<ReturnType<typeof pick>>;

beforeAll(async () => {
  [buyer, us, india] = await Promise.all([newUser('Protection Buyer'), pick('US', 87, 99), pick('IN', 55, 69)]);
});

afterAll(async () => {
  await deleteUser(buyer);
});

describe('protection plans', () => {
  it('cost about a tenth of the price, to the store’s .99, for the categories it covers', async () => {
    const { data: markets } = await admin().from('markets').select('id, protection_categories, protection_min_minor').order('id');
    expect(markets).toEqual([
      { id: 'IN', protection_categories: ['mobiles', 'electronics', 'wearables', 'computers', 'kitchen-appliances'], protection_min_minor: 100000 },
      { id: 'US', protection_categories: ['electronics', 'computers'], protection_min_minor: 2500 },
    ]);
    const a = us.covered;
    expect(['electronics', 'computers']).toContain(a.category_slug);
    expect(a.plan).toBe(Math.ceil(a.price_minor / 1000) * 100 - 1);
    const p = india.covered;
    expect(p.plan).toBe(Math.ceil(p.price_minor / 100000) * 10000 - 100);
    expect(await protectionOffer(anon(), 'no-such-product')).toBeNull();
  });

  it('goes on a guest’s cart line, into the totals, and stays on after sign-in', async () => {
    const token = crypto.randomUUID();
    const a = us.covered;
    await addToCart(anon(), 'US', a.id, 2, token);
    let cart = await setCartProtection(anon(), 'US', a.id, true, token);
    const line = cart.lines.find((l) => l.product.id === a.id)!;
    expect(line.protection).toEqual({ unitMinor: a.plan, added: true });
    const t = cart.totals;
    expect(t.protectionMinor).toBe(2 * a.plan);
    expect(t.totalMinor).toBe(t.subtotalMinor - (t.discountMinor ?? 0) + t.shipMinor + t.taxMinor + 2 * a.plan);

    // an unticked line's plan stays chosen but isn't counted
    cart = await selectCartLines(anon(), 'US', a.id, false, token);
    expect(cart.lines[0].protection).toEqual({ unitMinor: a.plan, added: true });
    expect(cart.totals.protectionMinor).toBeUndefined();
    await selectCartLines(anon(), 'US', a.id, true, token);

    await addToCart(anon(), 'US', us.uncovered.id, 1, token);
    expect(await failure(setCartProtection(anon(), 'US', us.uncovered.id, true, token))).toBe('invalid_input:protection');
    expect(await failure(setCartProtection(anon(), 'US', a.id, true, crypto.randomUUID()))).toBe('not_in_cart');
    cart = await getCart(anon(), 'US', token);
    expect(cart.lines.find((l) => l.product.id === us.uncovered.id)!.protection).toBeUndefined();

    await buyer.db.rpc('cart_clear', { p_market: 'US' });
    await mergeGuestCart(buyer.db, token);
    cart = await getCart(buyer.db, 'US');
    expect(cart.lines.find((l) => l.product.id === a.id)!.protection).toEqual({ unitMinor: a.plan, added: true });
    expect(cart.totals.protectionMinor).toBe(2 * a.plan);
  });

  it('is bought per unit with the order, and refunded with a cancelled item', async () => {
    const a = us.covered;
    const order = await placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
    const t = order.totals;
    expect(t.protectionMinor).toBe(2 * a.plan);
    expect(t.totalMinor).toBe(t.subtotalMinor - (t.discountMinor ?? 0) + t.shipMinor + t.taxMinor + 2 * a.plan);
    expect(order.items.find((i) => i.productId === a.id)!.protectionMinor).toBe(a.plan);
    expect(order.items.find((i) => i.productId === us.uncovered.id)!.protectionMinor).toBeUndefined();

    const balance = (await storeBalance(buyer.db, 'US'))!;
    const after = await cancelOrderItems(buyer.db, order.id, [a.id]);
    expect(after.totals.protectionMinor).toBeUndefined();
    const c = after.cancellations![0];
    expect(c.protectionMinor).toBe(2 * a.plan);
    expect(c.items[0].protectionMinor).toBe(a.plan);
    expect(c.refund.amountMinor).toBe(c.itemsMinor + c.taxMinor + 2 * a.plan);
    expect(await storeBalance(buyer.db, 'US')).toBe(balance + c.refund.amountMinor);
  });

  it('comes with Buy Now when asked for', async () => {
    const p = india.covered;
    const plain = await buyNowQuote(buyer.db, 'IN', p.id, 1);
    expect(plain.lines[0].protection).toEqual({ unitMinor: p.plan, added: false });
    expect(plain.totals.protectionMinor).toBeUndefined();
    const quote = await buyNowQuote(buyer.db, 'IN', p.id, 2, true);
    const t = quote.totals;
    expect(quote.lines[0].protection).toEqual({ unitMinor: p.plan, added: true });
    expect(t.protectionMinor).toBe(2 * p.plan);
    expect(t.totalMinor).toBe(t.subtotalMinor - (t.discountMinor ?? 0) + t.shipMinor + t.taxMinor + 2 * p.plan);

    const order = await placeOrder(buyer.db, 'IN', { paymentMethod: 'upi', shipping: IN_SHIPPING, buyNow: { productId: p.id, qty: 2, protection: true } });
    expect(order.items[0].protectionMinor).toBe(p.plan);
    expect(order.totals).toMatchObject({ protectionMinor: 2 * p.plan, totalMinor: quote.totals.totalMinor });
    // no plan for a product the store doesn't cover, asked for or not
    const other = await placeOrder(buyer.db, 'IN', { paymentMethod: 'upi', shipping: IN_SHIPPING, buyNow: { productId: india.uncovered.id, qty: 1, protection: true } });
    expect(other.totals.protectionMinor).toBeUndefined();
  });

  it('the cart API sets it', async () => {
    const a = us.covered;
    await setCartQty(buyer.db, 'US', a.id, 1);
    const token = (await buyer.db.auth.getSession()).data.session!.access_token;
    const patch = (body: object) =>
      PATCH(
        new NextRequest(`http://localhost/api/v1/cart/items/${a.id}?market=US`, {
          method: 'PATCH',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ productId: a.id }) },
      );
    expect((await patch({ protection: 'yes' })).status).toBe(422);
    const res = await patch({ protection: true });
    expect(res.status).toBe(200);
    const { cart } = await res.json();
    expect(cart.lines.find((l: { product: { id: string } }) => l.product.id === a.id).protection).toEqual({ unitMinor: a.plan, added: true });
    expect(cart.totals.protectionMinor).toBe(a.plan);
  });
});
