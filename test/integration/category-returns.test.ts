import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { createCategory, listAdminCategories } from '@/lib/data/admin-categories';
import { setCartQty } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { getOrder, placeOrder } from '@/lib/data/orders';
import { categoryReturnDays, setCategoryReturnDays } from '@/lib/data/return-policy';
import { getOrderReturns, requestReturn } from '@/lib/data/returns';
import type { Order } from '@/lib/types';
import { admin, anon, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, type TestUser } from './helpers';

const DAY = 86_400_000;

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
let shopper: TestUser;
// the test's own categories in amazon.in: none (0 days), short (7 days), and one with the store's 10
let none: string;
let short: string;
let plain: string;
const products: string[] = [];
let [pNone, pShort, pPlain] = ['', '', ''];
let order: Order;

const product = (category: string): ProductInput => ({
  title: `Return window test ${tag}`,
  brand: null,
  category,
  image: '/products/placeholder.jpg',
  priceMinor: 49_900,
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

/** Each line's window as saved on the order (service role). */
async function savedDays(orderId: string): Promise<Record<string, number | null>> {
  const { data, error } = await admin().from('order_items').select('product_id, return_days').eq('order_id', orderId);
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [r.product_id, r.return_days]));
}

beforeAll(async () => {
  [boss, buyer, shopper] = await Promise.all([newUser('Return Window Admin'), newUser('Return Window Buyer'), newUser('Return Window Shopper')]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  none = await createCategory(boss.db, { name: `Hygiene ${tag}` }, 'IN');
  short = await createCategory(boss.db, { name: `Gadgets ${tag}` }, 'IN');
  plain = await createCategory(boss.db, { name: `Home ${tag}` }, 'IN');
  pNone = await createProduct(boss.db, 'IN', product(none));
  pShort = await createProduct(boss.db, 'IN', product(short));
  pPlain = await createProduct(boss.db, 'IN', product(plain));
  products.push(pNone, pShort, pPlain);
});

afterAll(async () => {
  // orders go with the buyer, and then the products can
  await Promise.all([deleteUser(buyer), deleteUser(shopper)]);
  if (products.length) await admin().from('products').delete().in('id', products);
  const slugs = [none, short, plain].filter(Boolean);
  if (slugs.length) {
    await admin().from('market_categories').delete().in('category_slug', slugs);
    await admin().from('categories').delete().in('slug', slugs);
  }
  await deleteUser(boss);
});

describe('return windows by category', () => {
  it('admins set a category’s window in a store; nobody else can', async () => {
    await setCategoryReturnDays(boss.db, 'IN', none, 0);
    await setCategoryReturnDays(boss.db, 'IN', short, 7);
    expect(await failure(setCategoryReturnDays(shopper.db, 'IN', short, 30))).toBe('category_not_found:');
    // not listed in that store
    expect(await failure(setCategoryReturnDays(boss.db, 'US', short, 30))).toBe('category_not_found:');
    expect(await failure(setCategoryReturnDays(boss.db, 'IN', short, 400))).toMatch(/^invalid_input/);

    const rows = new Map((await listAdminCategories(boss.db)).map((c) => [c.slug, c]));
    expect(rows.get(none)!.stores.IN.returnDays).toBe(0);
    expect(rows.get(short)!.stores.IN.returnDays).toBe(7);
    expect(rows.get(plain)!.stores.IN.returnDays).toBeNull();

    // what shoppers see: the category's window, else the store's
    expect(await categoryReturnDays(anon(), 'IN', none, 10)).toBe(0);
    expect(await categoryReturnDays(anon(), 'IN', short, 10)).toBe(7);
    expect(await categoryReturnDays(anon(), 'IN', plain, 10)).toBe(10);
  });

  it('an order line keeps the window it was sold with', async () => {
    for (const id of products) await setCartQty(buyer.db, 'IN', id, 1);
    order = await placeOrder(buyer.db, 'IN', { paymentMethod: 'amazonpay', shipping: IN_SHIPPING });
    const days = Object.fromEntries(order.items.map((it) => [it.productId, it.returnDays]));
    expect(days).toEqual({ [pNone]: 0, [pShort]: 7, [pPlain]: undefined });

    // a later change is for new orders only
    await setCategoryReturnDays(boss.db, 'IN', short, 3);
    expect(await savedDays(order.id)).toEqual({ [pNone]: 0, [pShort]: 7, [pPlain]: null });
    expect((await getOrder(buyer.db, order.id))!.items.find((it) => it.productId === pShort)!.returnDays).toBe(7);

    // and the buyer can't change it
    const { data } = await buyer.db.from('order_items').update({ return_days: 365 }).eq('order_id', order.id).select('product_id');
    expect(data ?? []).toEqual([]);
    expect((await savedDays(order.id))[pNone]).toBe(0);
  });

  it('each line can go back within its own window', async () => {
    await deliveredDaysAgo(order.id, 5);
    let r = (await getOrderReturns(buyer.db, order.id))!;
    expect(r.returnable).toEqual({ [pNone]: 0, [pShort]: 1, [pPlain]: 1 });
    const delivered = Date.parse(r.returnByItem[pPlain]) - 10 * DAY;
    expect(Math.round((Date.parse(r.returnByItem[pShort]) - delivered) / DAY)).toBe(7);
    expect(Math.round((Date.parse(r.returnByItem[pNone]) - delivered) / DAY)).toBe(0);
    expect(await failure(requestReturn(buyer.db, order.id, { items: [{ productId: pNone, qty: 1 }], reason: 'no_longer_needed' }))).toBe(
      'return_not_allowed:window_closed',
    );

    // a week and a day on: only the store's window is still open
    await deliveredDaysAgo(order.id, 8);
    r = (await getOrderReturns(buyer.db, order.id))!;
    expect(r.returnable).toEqual({ [pNone]: 0, [pShort]: 0, [pPlain]: 1 });
    expect(await failure(requestReturn(buyer.db, order.id, { items: [{ productId: pShort, qty: 1 }], reason: 'defective' }))).toBe(
      'return_not_allowed:window_closed',
    );
    const back = await requestReturn(buyer.db, order.id, { items: [{ productId: pPlain, qty: 1 }], reason: 'no_longer_needed' });
    expect(back).toMatchObject({ status: 'requested', itemsMinor: 49_900 });
  });

  it('is served at /admin/categories/:slug and /products/:id', async () => {
    const patch = await import('@/app/api/v1/admin/categories/[slug]/route');
    const item = await import('@/app/api/v1/products/[id]/route');
    const token = (await boss.db.auth.getSession()).data.session!.access_token;
    const req = (path: string, init: { method?: string; body?: unknown } = {}) =>
      new NextRequest(`http://localhost/api/v1${path}`, {
        method: init.method ?? 'GET',
        headers: { authorization: `Bearer ${token}`, 'x-market': 'IN', 'content-type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });

    const set = await patch.PATCH(req(`/admin/categories/${short}`, { method: 'PATCH', body: { returnDays: 14 } }), { params: Promise.resolve({ slug: short }) });
    expect(set.status).toBe(200);
    expect(((await set.json()) as { category: { stores: { IN: { returnDays: number | null } } } }).category.stores.IN.returnDays).toBe(14);
    const bad = await patch.PATCH(req(`/admin/categories/${short}`, { method: 'PATCH', body: { returnDays: 400 } }), { params: Promise.resolve({ slug: short }) });
    expect(bad.status).toBe(422);
    const typed = await patch.PATCH(req(`/admin/categories/${short}`, { method: 'PATCH', body: { returnDays: '7' } }), { params: Promise.resolve({ slug: short }) });
    expect(typed.status).toBe(422);

    const days = async (id: string) =>
      ((await (await item.GET(req(`/products/${id}`), { params: Promise.resolve({ id }) })).json()) as { returnDays: number }).returnDays;
    expect(await days(pShort)).toBe(14);
    expect(await days(pNone)).toBe(0);
    expect(await days(pPlain)).toBe(10);

    const cleared = await patch.PATCH(req(`/admin/categories/${short}`, { method: 'PATCH', body: { returnDays: null } }), { params: Promise.resolve({ slug: short }) });
    expect(((await cleared.json()) as { category: { stores: { IN: { returnDays: number | null } } } }).category.stores.IN.returnDays).toBeNull();
    expect(await days(pShort)).toBe(10);
  });
});
