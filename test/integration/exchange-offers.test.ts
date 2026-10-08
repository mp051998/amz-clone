import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { createCategory, listAdminCategories } from '@/lib/data/admin-categories';
import { DataError } from '@/lib/data/errors';
import { categoryExchangeKind, exchangeQuote, listExchangeDevices, setCategoryExchangeKind } from '@/lib/data/exchange';
import { cancelOrder, placeOrder } from '@/lib/data/orders';
import { buildInvoice } from '@/lib/invoice';
import type { ExchangeChoice } from '@/lib/exchange';
import { admin, anon, deleteUser, IN_SHIPPING, newUser, type TestUser } from './helpers';

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
const BRAND = `Ex${tag}`;
// this file's own models: a phone, a laptop and a phone the store no longer takes
const DEVICES = [
  { id: `ex${tag}-phone`, kind: 'phone', brand: BRAND, model: 'One', value_minor: 1_500_000, active: true },
  { id: `ex${tag}-laptop`, kind: 'laptop', brand: BRAND, model: 'Book', value_minor: 2_000_000, active: true },
  { id: `ex${tag}-gone`, kind: 'phone', brand: BRAND, model: 'Zero', value_minor: 900_000, active: false },
];
const PHONE: ExchangeChoice = { deviceId: `ex${tag}-phone`, condition: 'good' };

let boss: TestUser;
let shopper: TestUser;
// the test's own amazon.in categories: phones (taking old phones in) and one without exchange offers
let phones: string;
let plain: string;
const products: string[] = [];
// ₹49,999 and ₹9,999 phones, and a ₹49,999 thing in the plain category
let [phone, cheapPhone, other] = ['', '', ''];

const product = (category: string, priceMinor: number): ProductInput => ({
  title: `Exchange test ${tag}`,
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
  stock: 10,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
});

const buy = (productId: string, exchange?: ExchangeChoice, qty = 1) =>
  placeOrder(shopper.db, 'IN', { paymentMethod: 'upi', shipping: IN_SHIPPING, buyNow: { productId, qty, ...(exchange ? { exchange } : {}) } });

beforeAll(async () => {
  [boss, shopper] = await Promise.all([newUser('Exchange Admin'), newUser('Exchange Shopper')]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  phones = await createCategory(boss.db, { name: `Phones ${tag}` }, 'IN');
  plain = await createCategory(boss.db, { name: `Home ${tag}` }, 'IN');
  phone = await createProduct(boss.db, 'IN', product(phones, 4_999_900));
  cheapPhone = await createProduct(boss.db, 'IN', product(phones, 999_900));
  other = await createProduct(boss.db, 'IN', product(plain, 4_999_900));
  products.push(phone, cheapPhone, other);
  const ins = await admin().from('exchange_devices').insert(DEVICES.map((d) => ({ market_id: 'IN', ...d })));
  if (ins.error) throw ins.error;
});

afterAll(async () => {
  // orders go with the shopper, and then the products and devices can
  await deleteUser(shopper);
  if (products.length) await admin().from('products').delete().in('id', products);
  await admin().from('exchange_devices').delete().in('id', DEVICES.map((d) => d.id));
  const slugs = [phones, plain].filter(Boolean);
  if (slugs.length) {
    await admin().from('market_categories').delete().in('category_slug', slugs);
    await admin().from('categories').delete().in('slug', slugs);
  }
  await deleteUser(boss);
});

describe('exchange offers', () => {
  it('admins say what a category takes in exchange, in India only; nobody else can', async () => {
    expect(await categoryExchangeKind(anon(), 'IN', phones)).toBeNull();
    await setCategoryExchangeKind(boss.db, 'IN', phones, 'phone');
    expect(await categoryExchangeKind(anon(), 'IN', phones)).toBe('phone');
    expect((await listAdminCategories(boss.db)).find((c) => c.slug === phones)?.stores.IN.exchangeKind).toBe('phone');

    expect(await failure(setCategoryExchangeKind(boss.db, 'US', phones, 'phone'))).toBe('invalid_input:exchange_kind');
    // the constraint holds it to India too
    const us = await admin().from('market_categories').insert({ market_id: 'US', category_slug: plain, position: 999, exchange_kind: 'phone' });
    expect(us.error).not.toBeNull();
    expect(await failure(setCategoryExchangeKind(shopper.db, 'IN', phones, null))).toBe('category_not_found:');
    expect(await categoryExchangeKind(anon(), 'IN', phones)).toBe('phone');
  });

  it('lists the models the store takes, and nobody but the store writes them', async () => {
    const mine = (await listExchangeDevices(anon(), 'IN', 'phone')).filter((d) => d.brand === BRAND);
    expect(mine).toEqual([{ id: `ex${tag}-phone`, kind: 'phone', brand: BRAND, model: 'One', valueMinor: 1_500_000 }]);
    expect((await listExchangeDevices(anon(), 'IN')).filter((d) => d.brand === BRAND).map((d) => d.id)).toEqual([`ex${tag}-laptop`, `ex${tag}-phone`]);
    expect((await listExchangeDevices(anon(), 'US')).some((d) => d.brand === BRAND)).toBe(false);

    const forged = await shopper.db.from('exchange_devices').insert({ id: `ex${tag}-mine`, market_id: 'IN', kind: 'phone', brand: BRAND, model: 'Mine', value_minor: 9_000_000 });
    expect(forged.error).not.toBeNull();
    const raised = await shopper.db.from('exchange_devices').update({ value_minor: 9_000_000 }).eq('id', `ex${tag}-phone`).select('id');
    expect(raised.data ?? []).toEqual([]);
  });

  it('quotes its value: half with a damaged screen, never over half the price', async () => {
    expect(await exchangeQuote(anon(), 'IN', phone, PHONE)).toEqual({ valueMinor: 1_500_000, device: `${BRAND} One` });
    expect(await exchangeQuote(anon(), 'IN', phone, { ...PHONE, condition: 'screen_damaged' })).toEqual({ valueMinor: 750_000, device: `${BRAND} One` });
    expect((await exchangeQuote(anon(), 'IN', cheapPhone, PHONE)).valueMinor).toBe(499_950);

    expect(await failure(exchangeQuote(anon(), 'IN', other, PHONE))).toBe('exchange_unavailable:product');
    expect(await failure(exchangeQuote(anon(), 'IN', phone, { deviceId: `ex${tag}-laptop`, condition: 'good' }))).toBe('exchange_unavailable:device');
    expect(await failure(exchangeQuote(anon(), 'IN', phone, { deviceId: `ex${tag}-gone`, condition: 'good' }))).toBe('exchange_unavailable:device');
    expect(await failure(exchangeQuote(anon(), 'US', phone, PHONE))).toBe('product_not_found:');
  });

  it('comes off a Buy Now of one, and the order keeps the device', async () => {
    const without = await buy(phone);
    const o = await buy(phone, PHONE);
    expect(o.status).toBe('placed');
    expect(o.totals).toMatchObject({ subtotalMinor: 4_999_900, discountMinor: 1_500_000, exchangeMinor: 1_500_000, totalMinor: without.totals.totalMinor - 1_500_000 });
    expect(o.items[0]).toMatchObject({ qty: 1, unitDiscountMinor: 1_500_000, unitExchangeMinor: 1_500_000 });
    expect(o.exchange).toEqual({ deviceId: `ex${tag}-phone`, device: `${BRAND} One`, condition: 'good', valueMinor: 1_500_000 });
    expect(without.exchange).toBeUndefined();

    // the invoice shows it apart from coupons
    const inv = buildInvoice(o)!;
    expect(inv).toMatchObject({ discountMinor: 0, exchangeMinor: 1_500_000, exchange: `${BRAND} One (switches on, screen undamaged)` });
    expect(inv.lines[0]).toMatchObject({ discountMinor: 0, exchangeMinor: 1_500_000 });

    // ₹15,000 is more than half of ₹9,999
    const cheap = await buy(cheapPhone, PHONE);
    expect(cheap.totals.exchangeMinor).toBe(499_950);
    expect(cheap.exchange?.valueMinor).toBe(499_950);
  });

  it('is refused for a category without it, another kind, a model no longer taken, or more than one', async () => {
    expect(await failure(buy(other, PHONE))).toBe('exchange_unavailable:product');
    expect(await failure(buy(phone, { deviceId: `ex${tag}-laptop`, condition: 'good' }))).toBe('exchange_unavailable:device');
    expect(await failure(buy(phone, { deviceId: `ex${tag}-gone`, condition: 'good' }))).toBe('exchange_unavailable:device');
    expect(await failure(buy(phone, { deviceId: 'no-such-device', condition: 'good' }))).toBe('exchange_unavailable:device');
    expect(await failure(buy(phone, PHONE, 2))).toBe('exchange_unavailable:qty');
  });

  it('refunds what was paid when the order is cancelled', async () => {
    const o = await buy(phone, PHONE);
    const cancelled = await cancelOrder(shopper.db, o.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.refund?.amountMinor).toBe(o.totals.totalMinor);
    expect(cancelled.totals.exchangeMinor).toBe(1_500_000);
  });

  it('is served at /exchange-devices, /products/:id, /orders/buy-now and POST /orders', async () => {
    const devices = await import('@/app/api/v1/exchange-devices/route');
    const item = await import('@/app/api/v1/products/[id]/route');
    const buyNow = await import('@/app/api/v1/orders/buy-now/route');
    const orders = await import('@/app/api/v1/orders/route');
    const token = (await shopper.db.auth.getSession()).data.session!.access_token;
    const headers = { authorization: `Bearer ${token}`, 'x-market': 'IN', 'content-type': 'application/json' };
    const get = (path: string) => new NextRequest(`http://localhost/api/v1${path}`, { headers });
    const none = { params: Promise.resolve({}) };

    const list = (await (await devices.GET(get('/exchange-devices?kind=laptop'), none)).json()) as { devices: { id: string }[] };
    expect(list.devices.map((d) => d.id)).toContain(`ex${tag}-laptop`);
    expect(list.devices.map((d) => d.id)).not.toContain(`ex${tag}-phone`);
    expect((await devices.GET(get('/exchange-devices?kind=tablet'), none)).status).toBe(422);

    const detail = (await (await item.GET(get(`/products/${phone}`), { params: Promise.resolve({ id: phone }) })).json()) as { exchange: { kind: string; upToMinor: number } | null };
    expect(detail.exchange?.kind).toBe('phone');
    // the best phone the store takes, up to half the price
    expect(detail.exchange?.upToMinor).toBeGreaterThanOrEqual(1_500_000);
    expect(detail.exchange?.upToMinor).toBeLessThanOrEqual(2_499_950);
    const plainDetail = (await (await item.GET(get(`/products/${other}`), { params: Promise.resolve({ id: other }) })).json()) as { exchange: unknown };
    expect(plainDetail.exchange).toBeNull();

    const quoted = (await (await buyNow.GET(get(`/orders/buy-now?productId=${phone}&qty=3&exchange=${PHONE.deviceId}&condition=screen_damaged`), none)).json()) as {
      quote: { lines: { qty: number }[] };
      exchange: { valueMinor: number; device: string };
    };
    expect(quoted.exchange).toEqual({ valueMinor: 750_000, device: `${BRAND} One` });
    expect(quoted.quote.lines[0].qty).toBe(1);
    expect((await buyNow.GET(get(`/orders/buy-now?productId=${phone}&exchange=${PHONE.deviceId}`), none)).status).toBe(422);
    expect((await buyNow.GET(get(`/orders/buy-now?productId=${other}&exchange=${PHONE.deviceId}&condition=good`), none)).status).toBe(409);

    const post = (body: unknown) => orders.POST(new NextRequest('http://localhost/api/v1/orders', { method: 'POST', headers, body: JSON.stringify(body) }), none);
    const placed = await post({ paymentMethod: 'upi', buyNow: { productId: phone, exchange: PHONE }, shipping: IN_SHIPPING });
    expect(placed.status).toBe(201);
    const { order } = (await placed.json()) as { order: { exchange: { device: string }; totals: { exchangeMinor: number } } };
    expect(order).toMatchObject({ exchange: { device: `${BRAND} One` }, totals: { exchangeMinor: 1_500_000 } });
    expect((await post({ paymentMethod: 'upi', buyNow: { productId: phone, exchange: { deviceId: PHONE.deviceId, condition: 'mint' } }, shipping: IN_SHIPPING })).status).toBe(422);
    expect((await post({ paymentMethod: 'upi', buyNow: { productId: phone, qty: 2, exchange: PHONE }, shipping: IN_SHIPPING })).status).toBe(409);

    // admins set it from the API too, India only
    const patch = await import('@/app/api/v1/admin/categories/[slug]/route');
    const bossToken = (await boss.db.auth.getSession()).data.session!.access_token;
    const req = (market: string, body: unknown) =>
      new NextRequest(`http://localhost/api/v1/admin/categories/${plain}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${bossToken}`, 'x-market': market, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const set = await patch.PATCH(req('IN', { exchangeKind: 'laptop' }), { params: Promise.resolve({ slug: plain }) });
    expect(set.status).toBe(200);
    expect(((await set.json()) as { category: { stores: { IN: { exchangeKind: string | null } } } }).category.stores.IN.exchangeKind).toBe('laptop');
    expect((await patch.PATCH(req('IN', { exchangeKind: 'tablet' }), { params: Promise.resolve({ slug: plain }) })).status).toBe(422);
    expect((await patch.PATCH(req('US', { exchangeKind: 'phone' }), { params: Promise.resolve({ slug: plain }) })).status).toBe(422);
    const cleared = await patch.PATCH(req('IN', { exchangeKind: null }), { params: Promise.resolve({ slug: plain }) });
    expect(((await cleared.json()) as { category: { stores: { IN: { exchangeKind: string | null } } } }).category.stores.IN.exchangeKind).toBeNull();
  });
});
