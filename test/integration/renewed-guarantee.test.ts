import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { createCategory } from '@/lib/data/admin-categories';
import { setCartQty } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { placeOrder } from '@/lib/data/orders';
import { listRenewed } from '@/lib/data/renewed';
import { setCategoryReturnDays } from '@/lib/data/return-policy';
import { getOrderReturns, requestReturn } from '@/lib/data/returns';
import type { Market, Order } from '@/lib/types';
import { admin, anon, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, US_SHIPPING, type TestUser } from './helpers';

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
// the test's own categories, each with a 7-day window: one in each store
let usCat: string;
let inCat: string;
let usPhone: string;
let inPhone: string;
const renewed = (id: string) => `${id}-o1`;
let usOrder: Order;
let inOrder: Order;

const input = (category: string, priceMinor: number): ProductInput => ({
  title: `Renewed${tag} phone`,
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
  seller: 'Phone Maker',
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

// another seller lists a renewed offer on the product (sellers have no app of their own yet)
const addRenewed = (market: Market, of: string, category: string, priceMinor: number) =>
  admin().from('products').insert({
    id: renewed(of),
    market_id: market,
    offer_of: of,
    position: 0,
    category_slug: category,
    title: 'copied from the product',
    image: 'copied',
    price_minor: priceMinor,
    seller: 'Renew Co',
    ships_from: 'Renew Co',
    stock: 3,
    condition: 'renewed',
    condition_note: 'Inspected, tested and cleaned.',
  });

/** Each line's window as saved on the order (service role). */
async function savedDays(orderId: string): Promise<Record<string, number | null>> {
  const { data, error } = await admin().from('order_items').select('product_id, return_days').eq('order_id', orderId);
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [r.product_id, r.return_days]));
}

beforeAll(async () => {
  [boss, buyer] = await Promise.all([newUser('Renewed Admin'), newUser('Renewed Buyer')]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  usCat = await createCategory(boss.db, { name: `Phones ${tag}` }, 'US');
  inCat = await createCategory(boss.db, { name: `Mobiles ${tag}` }, 'IN');
  await setCategoryReturnDays(boss.db, 'US', usCat, 7);
  await setCategoryReturnDays(boss.db, 'IN', inCat, 7);
  usPhone = await createProduct(boss.db, 'US', input(usCat, 39_900));
  inPhone = await createProduct(boss.db, 'IN', input(inCat, 2_999_900));
  for (const res of [await addRenewed('US', usPhone, usCat, 24_900), await addRenewed('IN', inPhone, inCat, 1_999_900)]) if (res.error) throw res.error;
});

afterAll(async () => {
  // orders go with the buyer, then offers before the products they're of
  await deleteUser(buyer);
  const offers = [usPhone, inPhone].filter(Boolean).map(renewed);
  if (offers.length) await admin().from('products').delete().in('id', offers);
  const products = [usPhone, inPhone].filter(Boolean);
  if (products.length) await admin().from('products').delete().in('id', products);
  const slugs = [usCat, inCat].filter(Boolean);
  if (slugs.length) {
    await admin().from('market_categories').delete().in('category_slug', slugs);
    await admin().from('categories').delete().in('slug', slugs);
  }
  await deleteUser(boss);
});

describe('the Renewed Guarantee', () => {
  it('lists each store’s renewed offers with their products, in stock only', async () => {
    const us = await listRenewed(anon(), 'US');
    expect(us.find((x) => x.offer.id === renewed(usPhone))).toMatchObject({
      offer: { offerOf: usPhone, condition: 'renewed', priceMinor: 24_900, seller: 'Renew Co' },
      product: { id: usPhone, priceMinor: 39_900 },
    });
    expect(us.every((x) => x.offer.condition === 'renewed' && x.offer.offerOf === x.product.id && x.offer.market === 'US')).toBe(true);
    expect((await listRenewed(anon(), 'IN')).map((x) => x.offer.id)).toContain(renewed(inPhone));

    await admin().from('products').update({ stock: 0 }).eq('id', renewed(usPhone));
    expect((await listRenewed(anon(), 'US')).map((x) => x.offer.id)).not.toContain(renewed(usPhone));
    await admin().from('products').update({ stock: 3 }).eq('id', renewed(usPhone));
  });

  it('gives a US line bought renewed 90 days, over its category’s 7', async () => {
    await setCartQty(buyer.db, 'US', renewed(usPhone), 1);
    await setCartQty(buyer.db, 'US', usPhone, 1);
    usOrder = await placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
    const days = Object.fromEntries(usOrder.items.map((it) => [it.productId, it.returnDays]));
    expect(days).toEqual({ [renewed(usPhone)]: 90, [usPhone]: 7 });
    expect(usOrder.items.find((it) => it.productId === renewed(usPhone))).toMatchObject({ condition: 'renewed', offerOf: usPhone });
    expect(await savedDays(usOrder.id)).toEqual({ [renewed(usPhone)]: 90, [usPhone]: 7 });
  });

  it('takes the renewed one back 45 days after delivery, and not the new one', async () => {
    await deliveredDaysAgo(usOrder.id, 45);
    const r = (await getOrderReturns(buyer.db, usOrder.id))!;
    expect(r.returnable).toEqual({ [renewed(usPhone)]: 1, [usPhone]: 0 });
    expect(await failure(requestReturn(buyer.db, usOrder.id, { items: [{ productId: usPhone, qty: 1 }], reason: 'defective' }))).toBe('return_not_allowed:window_closed');
    const back = await requestReturn(buyer.db, usOrder.id, { items: [{ productId: renewed(usPhone), qty: 1 }], reason: 'defective' });
    expect(back).toMatchObject({ status: 'requested', itemsMinor: 24_900 });
  });

  it('leaves an India line bought renewed with its category’s window', async () => {
    await setCartQty(buyer.db, 'IN', renewed(inPhone), 1);
    inOrder = await placeOrder(buyer.db, 'IN', { paymentMethod: 'amazonpay', shipping: IN_SHIPPING });
    expect(inOrder.items.map((it) => [it.productId, it.condition, it.returnDays])).toEqual([[renewed(inPhone), 'renewed', 7]]);
  });

  it('is served at /renewed', async () => {
    const list = await import('@/app/api/v1/renewed/route');
    const token = (await buyer.db.auth.getSession()).data.session!.access_token;
    const get = async (market: Market) =>
      (await (
        await list.GET(new NextRequest('http://localhost/api/v1/renewed', { headers: { authorization: `Bearer ${token}`, 'x-market': market } }), { params: Promise.resolve({}) })
      ).json()) as {
        renewed: { offer: { id: string }; product: { id: string } }[];
        guaranteeDays: number | null;
      };
    const us = await get('US');
    expect(us.guaranteeDays).toBe(90);
    expect(us.renewed.find((x) => x.offer.id === renewed(usPhone))?.product.id).toBe(usPhone);
    const ind = await get('IN');
    expect(ind.guaranteeDays).toBeNull();
    expect(ind.renewed.map((x) => x.offer.id)).toContain(renewed(inPhone));
  });
});
