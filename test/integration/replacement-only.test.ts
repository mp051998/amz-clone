import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { createCategory, listAdminCategories } from '@/lib/data/admin-categories';
import { setCartQty } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { getOrder, placeOrder } from '@/lib/data/orders';
import { categoryReturnPolicy, setCategoryReturnPolicy } from '@/lib/data/return-policy';
import { requestReturn } from '@/lib/data/returns';
import type { Order } from '@/lib/types';
import { admin, anon, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, type TestUser } from './helpers';

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
// the test's own categories in amazon.in: phones (replacement only, 7 days) and one refundable
let phones: string;
let plain: string;
const products: string[] = [];
let [pPhone, pTablet, pPlain] = ['', '', ''];
let order: Order;

const product = (category: string): ProductInput => ({
  title: `Replacement only test ${tag}`,
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

/** Each line's replacement_only as saved on the order (service role). */
async function saved(orderId: string): Promise<Record<string, boolean>> {
  const { data, error } = await admin().from('order_items').select('product_id, replacement_only').eq('order_id', orderId);
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [r.product_id, r.replacement_only]));
}

beforeAll(async () => {
  [boss, buyer, shopper] = await Promise.all([newUser('Replacement Admin'), newUser('Replacement Buyer'), newUser('Replacement Shopper')]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  phones = await createCategory(boss.db, { name: `Phones ${tag}` }, 'IN');
  plain = await createCategory(boss.db, { name: `Kitchen ${tag}` }, 'IN');
  pPhone = await createProduct(boss.db, 'IN', product(phones));
  pTablet = await createProduct(boss.db, 'IN', product(phones));
  pPlain = await createProduct(boss.db, 'IN', product(plain));
  products.push(pPhone, pTablet, pPlain);
});

afterAll(async () => {
  // orders (and their returns) go with the buyer, and then the products can
  await Promise.all([deleteUser(buyer), deleteUser(shopper)]);
  if (products.length) await admin().from('products').delete().in('id', products);
  const slugs = [phones, plain].filter(Boolean);
  if (slugs.length) {
    await admin().from('market_categories').delete().in('category_slug', slugs);
    await admin().from('categories').delete().in('slug', slugs);
  }
  await deleteUser(boss);
});

describe('replacement-only categories', () => {
  it('admins make a category replacement only in a store; nobody else can', async () => {
    await setCategoryReturnPolicy(boss.db, 'IN', phones, { days: 7, replacementOnly: true });
    expect(await failure(setCategoryReturnPolicy(shopper.db, 'IN', plain, { replacementOnly: true }))).toBe('category_not_found:');

    const rows = new Map((await listAdminCategories(boss.db)).map((c) => [c.slug, c]));
    expect(rows.get(phones)!.stores.IN).toMatchObject({ returnDays: 7, replacementOnly: true });
    expect(rows.get(plain)!.stores.IN).toMatchObject({ returnDays: null, replacementOnly: false });

    expect(await categoryReturnPolicy(anon(), 'IN', phones, 10)).toEqual({ days: 7, replacementOnly: true });
    expect(await categoryReturnPolicy(anon(), 'IN', plain, 10)).toEqual({ days: 10, replacementOnly: false });
  });

  it('an order line keeps it from when it was ordered', async () => {
    for (const id of products) await setCartQty(buyer.db, 'IN', id, 1);
    order = await placeOrder(buyer.db, 'IN', { paymentMethod: 'amazonpay', shipping: IN_SHIPPING });
    const only = Object.fromEntries(order.items.map((it) => [it.productId, it.replacementOnly]));
    expect(only).toEqual({ [pPhone]: true, [pTablet]: true, [pPlain]: undefined });

    // a later change is for new orders only
    await setCategoryReturnPolicy(boss.db, 'IN', phones, { replacementOnly: false });
    expect(await saved(order.id)).toEqual({ [pPhone]: true, [pTablet]: true, [pPlain]: false });
    expect((await getOrder(buyer.db, order.id))!.items.find((it) => it.productId === pPhone)!.replacementOnly).toBe(true);
    await setCategoryReturnPolicy(boss.db, 'IN', phones, { replacementOnly: true });

    // and the buyer can't change it
    const { data } = await buyer.db.from('order_items').update({ replacement_only: false }).eq('order_id', order.id).select('product_id');
    expect(data ?? []).toEqual([]);
    expect((await saved(order.id))[pPhone]).toBe(true);
  });

  it('goes back only when faulty, as a replacement, and is refunded only when it can’t be replaced', async () => {
    await deliveredDaysAgo(order.id, 2);
    const back = (productId: string, reason: string, resolution?: string) =>
      requestReturn(buyer.db, order.id, { items: [{ productId, qty: 1 }], reason, ...(resolution ? { resolution } : {}) });

    // a change of mind, or a refund while it can be replaced
    expect(await failure(back(pPhone, 'no_longer_needed'))).toBe('return_not_allowed:replacement_only');
    expect(await failure(back(pPhone, 'defective'))).toBe('return_not_allowed:replacement_only');
    // with something refundable in the same return, too
    expect(
      await failure(requestReturn(buyer.db, order.id, { items: [{ productId: pPhone, qty: 1 }, { productId: pPlain, qty: 1 }], reason: 'no_longer_needed' })),
    ).toBe('return_not_allowed:replacement_only');

    const swapped = await back(pPhone, 'defective', 'replacement');
    expect(swapped).toMatchObject({ resolution: 'replacement', itemsMinor: 0 });

    // sold out: a refund instead
    await admin().from('products').update({ stock: 0 }).eq('id', pTablet);
    expect(await failure(back(pTablet, 'damaged', 'replacement'))).toBe('replacement_unavailable:out_of_stock');
    expect(await back(pTablet, 'damaged')).toMatchObject({ resolution: 'refund', itemsMinor: 49_900 });

    // anything else goes back as before
    expect(await back(pPlain, 'no_longer_needed')).toMatchObject({ resolution: 'refund', itemsMinor: 49_900 });
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
    type Body = { category: { stores: { IN: { returnDays: number | null; replacementOnly: boolean } } } };

    const set = await patch.PATCH(req(`/admin/categories/${plain}`, { method: 'PATCH', body: { replacementOnly: true } }), { params: Promise.resolve({ slug: plain }) });
    expect(set.status).toBe(200);
    expect(((await set.json()) as Body).category.stores.IN).toMatchObject({ returnDays: null, replacementOnly: true });
    const bad = await patch.PATCH(req(`/admin/categories/${plain}`, { method: 'PATCH', body: { replacementOnly: 'yes' } }), { params: Promise.resolve({ slug: plain }) });
    expect(bad.status).toBe(422);

    const policy = async (id: string) => {
      const b = (await (await item.GET(req(`/products/${id}`), { params: Promise.resolve({ id }) })).json()) as { returnDays: number; replacementOnly: boolean };
      return [b.returnDays, b.replacementOnly];
    };
    expect(await policy(pPhone)).toEqual([7, true]);
    expect(await policy(pPlain)).toEqual([10, true]);

    await patch.PATCH(req(`/admin/categories/${plain}`, { method: 'PATCH', body: { replacementOnly: false } }), { params: Promise.resolve({ slug: plain }) });
    expect(await policy(pPlain)).toEqual([10, false]);
  });
});
