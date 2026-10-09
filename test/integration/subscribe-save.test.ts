import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAddress, deleteAddress } from '@/lib/data/addresses';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { storeBalance } from '@/lib/data/balance';
import { getProduct } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';
import { getOrder } from '@/lib/data/orders';
import { cancelSubscription, listSubscriptions, skipSubscription, subscribe, subscribeMethods, subscriptionFor, updateSubscription } from '@/lib/data/subscriptions';
import { admin, anon, deleteUser, newUser, US_SHIPPING, type TestUser } from './helpers';

const tag = crypto.randomUUID().slice(0, 6);
const input = (n: number): ProductInput => ({
  title: `Sns${tag} face serum ${n}`,
  brand: 'Glow',
  category: 'beauty',
  image: '/products/placeholder.jpg',
  priceMinor: 2000 + n * 100,
  listMinor: null,
  deal: false,
  couponPct: null,
  maxPerCustomer: null,
  sizes: null,
  unit: null,
  qtyDiscount: null,
  releaseAt: null,
  badge: null,
  seller: 'Glow Store',
  shipsFrom: 'Amazon',
  bullets: ['Hydrating'],
  description: null,
  details: [],
  // under the stock the other tests pick products by
  stock: 20,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
});

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}${err.detail ? `:${err.detail}` : ''}` : String(err);
  }
  return 'ok';
};

const run = async (on: string) => {
  const { data, error } = await admin().rpc('run_subscriptions', { p_on: on });
  if (error) throw error;
  return data;
};

let boss: TestUser;
let me: TestUser;
let other: TestUser;
let address: string;
const serums: string[] = [];

beforeAll(async () => {
  boss = await newUser('Sns Admin');
  me = await newUser('Sns Shopper');
  other = await newUser('Sns Other');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  for (let n = 0; n < 7; n++) serums.push(await createProduct(boss.db, 'US', input(n)));
  const flag = await admin().from('products').update({ subscribe_save: true }).in('id', serums.slice(0, 6));
  if (flag.error) throw flag.error;
  address = (await createAddress(me.db, 'US', { ...US_SHIPPING, instructions: 'Leave at the door' })).id;
});

afterAll(async () => {
  await deleteUser(me);
  await deleteUser(other);
  // products with orders stay; take them off sale
  await admin().from('products').update({ archived_at: new Date().toISOString() }).in('id', serums);
  await deleteUser(boss);
});

describe('Subscribe & Save', () => {
  it('is offered on the flagged products, paid with what the store can charge by itself', async () => {
    expect((await getProduct(anon(), serums[0]))?.subscribeSave).toBe(true);
    expect((await getProduct(anon(), serums[6]))?.subscribeSave).toBeUndefined();
    expect(await subscribeMethods(anon(), 'US')).toEqual(['giftcard']);
    expect(await subscribeMethods(anon(), 'IN')).toEqual(['upi', 'netbanking', 'amazonpay']);
  });

  it('refuses what it can’t do', async () => {
    const sub = (over: Partial<Parameters<typeof subscribe>[1]> = {}) =>
      failure(subscribe(me.db, { market: 'US', productId: serums[0], qty: 1, everyMonths: 1, addressId: address, paymentMethod: 'giftcard', ...over }));
    expect(await sub({ paymentMethod: 'card' })).toBe('payment_method_unavailable');
    expect(await sub({ everyMonths: 7 })).toBe('invalid_input:every_months');
    expect(await sub({ qty: 11 })).toBe('invalid_input:qty');
    expect(await sub({ productId: serums[6] })).toBe('subscribe_unavailable');
    expect(await sub({ addressId: crypto.randomUUID() })).toBe('address_not_found');
    expect(await sub({ market: 'IN' })).toBe('product_not_found');
    expect(await failure(subscribe(anon(), { market: 'US', productId: serums[0], qty: 1, everyMonths: 1, addressId: address, paymentMethod: 'giftcard' }))).toMatch(/^forbidden/);
  });

  it('isn’t offered on a product limited per customer', async () => {
    await admin().from('products').update({ max_per_customer: 2 }).eq('id', serums[5]);
    expect((await getProduct(anon(), serums[5]))?.subscribeSave).toBeUndefined();
    expect(await failure(subscribe(me.db, { market: 'US', productId: serums[5], qty: 1, everyMonths: 1, addressId: address, paymentMethod: 'giftcard' }))).toBe('subscribe_unavailable');
    await admin().from('products').update({ max_per_customer: null }).eq('id', serums[5]);
  });

  it('places the first delivery straight away: 5% off, free delivery, paid from the balance', async () => {
    const before = await storeBalance(me.db, 'US');
    const { subscription, order } = await subscribe(me.db, { market: 'US', productId: serums[0], qty: 2, everyMonths: 1, addressId: address, paymentMethod: 'giftcard' });
    expect(subscription).toMatchObject({ productId: serums[0], qty: 2, everyMonths: 1, addressId: address, paymentMethod: 'giftcard', status: 'active', lastOrderId: order.id });
    expect(subscription.issue).toBeUndefined();
    // 2 × 2000, 5% off each unit: 100
    expect(order.totals).toMatchObject({ subtotalMinor: 4000, discountMinor: 200, snsMinor: 200, shipMinor: 0 });
    expect(order.totals.totalMinor).toBe(4000 - 200 + order.totals.taxMinor);
    expect(order.items).toEqual([expect.objectContaining({ productId: serums[0], qty: 2, unitDiscountMinor: 100, unitSnsMinor: 100, subscriptionId: subscription.id })]);
    expect(order).toMatchObject({ status: 'placed', paymentMethod: 'giftcard' });
    expect(order.shipTo.instructions).toBe('Leave at the door');
    expect(await storeBalance(me.db, 'US')).toBe(before! - order.totals.totalMinor);
    // the order reads back as any other
    expect((await getOrder(me.db, order.id))?.totals.snsMinor).toBe(200);
    // the next one a month on
    const today = new Date(order.createdAt);
    expect(Date.parse(subscription.nextOn)).toBeGreaterThan(today.getTime() + 27 * 86_400_000);
    expect(await failure(subscribe(me.db, { market: 'US', productId: serums[0], qty: 1, everyMonths: 2, addressId: address, paymentMethod: 'giftcard' }))).toBe('already_subscribed');
    expect((await subscriptionFor(me.db, serums[0]))?.id).toBe(subscription.id);
  });

  it('is the shopper’s own', async () => {
    const [mine] = await listSubscriptions(me.db, 'US');
    expect(await listSubscriptions(other.db, 'US')).toEqual([]);
    expect(await failure(skipSubscription(other.db, mine.id))).toBe('subscription_not_found');
    expect(await failure(updateSubscription(other.db, mine.id, { qty: 3 }))).toBe('subscription_not_found');
    expect(await failure(cancelSubscription(other.db, mine.id))).toBe('subscription_not_found');
    // and written only through the functions
    const direct = await me.db.from('subscriptions').update({ qty: 9 }).eq('id', mine.id).select();
    expect(direct.data ?? []).toEqual([]);
  });

  it('delivers five subscriptions arriving together at 15% off, in one order', async () => {
    for (const id of serums.slice(1, 5)) await subscribe(me.db, { market: 'US', productId: id, qty: 1, everyMonths: 2, addressId: address, paymentMethod: 'giftcard' });
    const subs = await listSubscriptions(me.db, 'US');
    expect(subs).toHaveLength(5);
    // all due the same day
    const on = '2027-03-01';
    await admin().from('subscriptions').update({ next_on: on }).eq('user_id', me.id);
    expect(await run('2027-02-28')).toBe(0);
    expect(await run(on)).toBe(1);
    const after = await listSubscriptions(me.db, 'US');
    const orderIds = new Set(after.map((s) => s.lastOrderId));
    expect(orderIds.size).toBe(1);
    const order = (await getOrder(me.db, [...orderIds][0]!))!;
    expect(order.items).toHaveLength(5);
    for (const it of order.items) expect(it.unitSnsMinor).toBe(Math.floor((it.unitPriceMinor * 15) / 100));
    expect(order.totals.shipMinor).toBe(0);
    // each moves on by its own frequency
    expect(after.map((s) => [s.productId, s.nextOn]).sort()).toEqual(
      serums.slice(0, 5).map((id, i) => [id, i === 0 ? '2027-04-01' : '2027-05-01']).sort(),
    );
    // run again: nothing more is due
    expect(await run(on)).toBe(0);
  });

  it('skips, changes and cancels', async () => {
    const s = (await subscriptionFor(me.db, serums[0]))!;
    expect((await skipSubscription(me.db, s.id)).nextOn).toBe('2027-05-01');
    const changed = await updateSubscription(me.db, s.id, { qty: 3, everyMonths: 3 });
    expect(changed).toMatchObject({ qty: 3, everyMonths: 3, nextOn: '2027-05-01' });
    expect(await failure(updateSubscription(me.db, s.id, { everyMonths: 0 }))).toBe('invalid_input:every_months');
    expect(await failure(updateSubscription(me.db, s.id, { paymentMethod: 'card' }))).toBe('payment_method_unavailable');
    const cancelled = await cancelSubscription(me.db, s.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledAt).toBeDefined();
    expect((await listSubscriptions(me.db, 'US')).map((x) => x.id)).not.toContain(s.id);
    expect((await listSubscriptions(me.db, 'US', { includeCancelled: true })).map((x) => x.id)).toContain(s.id);
    expect(await failure(skipSubscription(me.db, s.id))).toBe('subscription_not_found');
    // and can subscribe again
    const again = await subscribe(me.db, { market: 'US', productId: serums[0], qty: 1, everyMonths: 1, addressId: address, paymentMethod: 'giftcard' });
    await cancelSubscription(me.db, again.subscription.id);
  });

  it('skips a delivery it can’t pay for or send, says why, and clears it once fixed', async () => {
    await admin().from('store_balances').update({ balance_minor: 0 }).eq('user_id', me.id).eq('market_id', 'US');
    await admin().from('subscriptions').update({ next_on: '2027-06-01' }).eq('user_id', me.id).eq('status', 'active');
    expect(await run('2027-06-01')).toBe(0);
    const unpaid = await listSubscriptions(me.db, 'US');
    expect(unpaid.map((s) => s.issue)).toEqual(unpaid.map(() => ({ kind: 'payment', on: expect.any(String) })));
    // moved on anyway
    expect(unpaid.every((s) => s.nextOn > '2027-06-01')).toBe(true);
    const fixed = await updateSubscription(me.db, unpaid[0].id, { paymentMethod: 'giftcard' });
    expect(fixed.issue).toBeUndefined();

    // the address goes: nothing can be sent until another is chosen
    await deleteAddress(me.db, 'US', address);
    const gone = (await listSubscriptions(me.db, 'US'))[0];
    expect(gone.addressId).toBeUndefined();
    await admin().from('store_balances').update({ balance_minor: 100_000_000 }).eq('user_id', me.id).eq('market_id', 'US');
    await admin().from('subscriptions').update({ next_on: '2027-09-01' }).eq('user_id', me.id).eq('status', 'active');
    expect(await run('2027-09-01')).toBe(0);
    expect((await listSubscriptions(me.db, 'US')).every((s) => s.issue?.kind === 'address')).toBe(true);
    address = (await createAddress(me.db, 'US', US_SHIPPING)).id;
    expect((await updateSubscription(me.db, gone.id, { addressId: address })).issue).toBeUndefined();

    // out of stock: that one is skipped, the rest go
    const [first, ...rest] = await listSubscriptions(me.db, 'US');
    for (const s of rest) await updateSubscription(me.db, s.id, { addressId: address });
    await admin().from('products').update({ stock: 0 }).eq('id', first.productId);
    await admin().from('subscriptions').update({ next_on: '2027-12-01' }).eq('user_id', me.id).eq('status', 'active');
    expect(await run('2027-12-01')).toBe(1);
    const after = await listSubscriptions(me.db, 'US');
    expect(after.find((s) => s.id === first.id)?.issue?.kind).toBe('out_of_stock');
    expect(after.filter((s) => s.id !== first.id).every((s) => !s.issue)).toBe(true);
    await admin().from('products').update({ stock: 20 }).eq('id', first.productId);
  });

  it('serves them at /me/subscriptions', async () => {
    const list = await import('@/app/api/v1/me/subscriptions/route');
    const one = await import('@/app/api/v1/me/subscriptions/[id]/route');
    const skip = await import('@/app/api/v1/me/subscriptions/[id]/skip/route');
    const token = (await other.db.auth.getSession()).data.session!.access_token;
    const req = (method: string, path = '', body?: unknown) =>
      new NextRequest(`http://localhost/api/v1/me/subscriptions${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-market': 'US' },
        body: body ? JSON.stringify(body) : undefined,
      });
    const none = { params: Promise.resolve({}) };
    const addressId = (await createAddress(other.db, 'US', US_SHIPPING)).id;
    expect((await list.POST(req('POST', '', { productId: serums[1], qty: '2', everyMonths: 1, addressId, paymentMethod: 'giftcard' }), none)).status).toBe(422);
    const made = await list.POST(req('POST', '', { productId: serums[1], qty: 2, everyMonths: 1, addressId, paymentMethod: 'giftcard' }), none);
    expect(made.status).toBe(201);
    const { subscription, order } = (await made.json()) as { subscription: { id: string }; order: { totals: { snsMinor: number } } };
    expect(order.totals.snsMinor).toBeGreaterThan(0);
    const got = (await (await list.GET(req('GET'), none)).json()) as { subscriptions: { id: string }[]; methods: string[] };
    expect(got).toEqual({ subscriptions: [expect.objectContaining({ id: subscription.id })], methods: ['giftcard'] });
    const ctx = { params: Promise.resolve({ id: subscription.id }) };
    expect(((await (await one.PATCH(req('PATCH', `/${subscription.id}`, { qty: 4 }), ctx)).json()) as { subscription: { qty: number } }).subscription.qty).toBe(4);
    expect((await skip.POST(req('POST', `/${subscription.id}/skip`), ctx)).status).toBe(200);
    const del = (await (await one.DELETE(req('DELETE', `/${subscription.id}`), ctx)).json()) as { subscription: { status: string } };
    expect(del.subscription.status).toBe('cancelled');
    expect((await one.DELETE(req('DELETE', `/${subscription.id}`), ctx)).status).toBe(404);
  });
});
