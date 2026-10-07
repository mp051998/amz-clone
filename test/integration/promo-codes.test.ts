import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addToCart } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { cancelOrder, placeOrder } from '@/lib/data/orders';
import { activePromoCodes, checkoutQuote } from '@/lib/data/promo';
import { anon, admin, deleteUser, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

type Product = { id: string; price_minor: number; category_slug: string };

const tag = Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
const CODES = { all: `ALL${tag}`, min: `MIN${tag}`, old: `OLD${tag}`, cat: `CAT${tag}` };
const DAY = 86_400_000;

let shopper: TestUser;
let a: Product;
let b: Product;

const product = async (offset: number): Promise<Product> => {
  const { id } = await pickProduct('US', offset);
  const { data, error } = await admin().from('products').select('id, price_minor, category_slug').eq('id', id).single();
  if (error) throw error;
  return data;
};

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
};

const buyNow = (p: Product, qty = 1) => ({ productId: p.id, qty });
const tenth = (minor: number) => Math.floor(minor / 10);

beforeAll(async () => {
  shopper = await newUser('Promo Shopper');
  // two products in different categories (US offsets 103–110 are this file's)
  a = await product(103);
  for (let off = 104; off <= 110 && !b; off++) {
    const p = await product(off);
    if (p.category_slug !== a.category_slug) b = p;
  }
  const now = Date.now();
  const { error } = await admin().from('promo_codes').insert([
    { market_id: 'US', code: CODES.all, percent_off: 10, description: '10% off your order' },
    { market_id: 'US', code: CODES.min, percent_off: 10, min_spend_minor: a.price_minor * 3, description: '10% off big orders' },
    { market_id: 'US', code: CODES.old, percent_off: 10, starts_at: new Date(now - 2 * DAY).toISOString(), ends_at: new Date(now - DAY).toISOString(), description: 'Gone' },
    { market_id: 'US', code: CODES.cat, percent_off: 20, category_slug: a.category_slug, description: '20% off one department' },
  ]);
  if (error) throw error;
});

afterAll(async () => {
  await admin().from('promo_codes').update({ ends_at: new Date().toISOString() }).eq('market_id', 'US').in('code', Object.values(CODES));
  await deleteUser(shopper);
});

describe('checkout quotes', () => {
  it('say why a code doesn’t apply, and price without it', async () => {
    const err = async (code: string, p = a, qty = 1) => (await checkoutQuote(shopper.db, 'US', code, buyNow(p, qty))).promoError;
    expect(await err(`NO${tag}`)).toEqual({ code: 'promo_invalid' });
    expect(await err(CODES.old)).toEqual({ code: 'promo_expired' });
    expect(await err(CODES.min, a, 2)).toEqual({ code: 'promo_min_spend', detail: String(a.price_minor * 3) });
    expect(await err(CODES.cat, b)).toEqual({ code: 'promo_not_eligible' });
    // the other store doesn't have it
    expect((await checkoutQuote(shopper.db, 'IN', CODES.all, buyNow(a))).promoError).toEqual({ code: 'promo_invalid' });

    const q = await checkoutQuote(shopper.db, 'US', CODES.old, buyNow(a));
    expect(q.cart.promo).toBeUndefined();
    expect(q.cart.totals.promoMinor).toBeUndefined();
  });

  it('take the percent off each unit, inside the discount, and name the code', async () => {
    const q = await checkoutQuote(shopper.db, 'US', CODES.all.toLowerCase(), buyNow(a, 2));
    expect(q.promoError).toBeUndefined();
    expect(q.cart.promo).toEqual({ code: CODES.all, percentOff: 10, description: '10% off your order' });
    expect(q.cart.lines[0]).toMatchObject({ promoMinor: tenth(a.price_minor) * 2, discountMinor: tenth(a.price_minor) * 2 });
    const t = q.cart.totals;
    expect(t.promoMinor).toBe(tenth(a.price_minor) * 2);
    expect(t.totalMinor).toBe(t.subtotalMinor - (t.discountMinor ?? 0) + t.shipMinor + t.taxMinor + (t.protectionMinor ?? 0));
  });

  it('need a signed-in shopper', async () => {
    expect(await codeOf(checkoutQuote(anon(), 'US', CODES.all))).toMatch(/^not_authenticated|^forbidden/);
  });
});

describe('ordering with a code', () => {
  it('fails the order for a code that doesn’t apply', async () => {
    const order = (code: string, qty = 1) => placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, buyNow: buyNow(a, qty), promoCode: code });
    expect(await codeOf(order(`NO${tag}`))).toBe('promo_invalid:');
    expect(await codeOf(order(CODES.old))).toBe('promo_expired:');
    expect(await codeOf(order(CODES.min))).toBe(`promo_min_spend:${a.price_minor * 3}`);
  });

  it('keeps the code and its part of each item’s discount, once per customer until cancelled', async () => {
    const order = () => placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, buyNow: buyNow(a, 2), promoCode: ` ${CODES.all.toLowerCase()} ` });
    const placed = await order();
    expect(placed.promoCode).toBe(CODES.all);
    expect(placed.items[0]).toMatchObject({ unitPromoMinor: tenth(a.price_minor), unitDiscountMinor: tenth(a.price_minor) });
    const t = placed.totals;
    expect(t).toMatchObject({ promoMinor: tenth(a.price_minor) * 2, discountMinor: tenth(a.price_minor) * 2 });
    expect(t.totalMinor).toBe(t.subtotalMinor - (t.discountMinor ?? 0) + t.shipMinor + t.taxMinor);

    expect(await codeOf(order())).toBe('promo_used:');
    expect((await checkoutQuote(shopper.db, 'US', CODES.all, buyNow(a))).promoError).toEqual({ code: 'promo_used' });

    await cancelOrder(shopper.db, placed.id);
    expect((await checkoutQuote(shopper.db, 'US', CODES.all, buyNow(a))).promoError).toBeUndefined();
    expect((await order()).promoCode).toBe(CODES.all);
  });

  it('takes a department’s code off only that department’s items in the cart', async () => {
    await addToCart(shopper.db, 'US', a.id, 1);
    await addToCart(shopper.db, 'US', b.id, 1);
    const placed = await placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, promoCode: CODES.cat });
    const item = (id: string) => placed.items.find((it) => it.productId === id);
    expect(item(a.id)?.unitPromoMinor).toBe(Math.floor(a.price_minor / 5));
    expect(item(b.id)?.unitPromoMinor).toBeUndefined();
    expect(placed.totals.promoMinor).toBe(Math.floor(a.price_minor / 5));
  });
});

it('lists the running codes, not the ended ones, to anyone', async () => {
  const codes = (await activePromoCodes(anon(), 'US')).map((p) => p.code);
  expect(codes).toEqual(expect.arrayContaining([CODES.all, CODES.min, CODES.cat]));
  expect(codes).not.toContain(CODES.old);
  const cat = (await activePromoCodes(anon(), 'US')).find((p) => p.code === CODES.cat);
  expect(cat).toMatchObject({ percentOff: 20, category: { slug: a.category_slug } });
});
