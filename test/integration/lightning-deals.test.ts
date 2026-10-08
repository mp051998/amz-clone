import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, updateProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { getProduct } from '@/lib/data/catalog';
import { lightningDeals, lightningDealsFor } from '@/lib/data/lightning-deals';
import { placeOrder } from '@/lib/data/orders';
import { admin, anon, deleteUser, newUser, US_SHIPPING, type TestUser } from './helpers';

const tag = crypto.randomUUID().slice(0, 6);
const input = (n: number, over: Partial<ProductInput> = {}): ProductInput => ({
  title: `Ld${tag} desk lamp ${n}`,
  brand: 'Lumen',
  category: 'home-kitchen',
  image: '/products/placeholder.jpg',
  priceMinor: 5000,
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
  seller: 'Lumen Store',
  shipsFrom: 'Amazon',
  bullets: ['Dimmable'],
  description: null,
  details: [],
  // under the stock the other tests pick products by
  stock: 20,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
  ...over,
});

const MIN = 60_000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

/** A deal on `product` (service role, as the store's plan does), live from a minute ago unless said. */
async function addDeal(product: string, dealPriceMinor: number, over: { quota?: number; startsAt?: string; endsAt?: string } = {}) {
  const { data, error } = await admin()
    .from('lightning_deals')
    .insert({ product_id: product, market_id: 'US', deal_price_minor: dealPriceMinor, quota: over.quota ?? 50, starts_at: over.startsAt ?? at(-MIN), ends_at: over.endsAt ?? at(60 * MIN) })
    .select('id')
    .single();
  return { id: data?.id as string, error };
}

const tick = async () => {
  const { error } = await admin().rpc('tick_lightning_deals');
  if (error) throw error;
};

const dealRow = async (id: string) => {
  const { data, error } = await admin().from('lightning_deals').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
};

const buy = (productId: string, qty: number) => placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, buyNow: { productId, qty } });

let boss: TestUser;
let shopper: TestUser;
// a: $50.00, no list price; b: $40.00 with a $60.00 list price; c: upcoming only
let a: string;
let b: string;
let c: string;

beforeAll(async () => {
  boss = await newUser('Ld Admin');
  shopper = await newUser('Ld Shopper');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  a = await createProduct(boss.db, 'US', input(1));
  b = await createProduct(boss.db, 'US', input(2, { priceMinor: 4000, listMinor: 6000, deal: true }));
  c = await createProduct(boss.db, 'US', input(3));
});

afterAll(async () => {
  await admin().from('lightning_deals').delete().in('product_id', [a, b, c]);
  await deleteUser(shopper);
  // products with orders stay; take them off sale
  await admin().from('products').update({ archived_at: new Date().toISOString() }).in('id', [a, b, c]);
  await deleteUser(boss);
});

describe('Lightning Deals', () => {
  it('are below the product’s price, up to 12 hours, and don’t overlap', async () => {
    expect((await addDeal(a, 5000)).error).toMatchObject({ message: 'invalid_input', details: 'deal_price_minor' });
    expect((await addDeal(a, 3500, { endsAt: at(13 * 60 * MIN) })).error?.message).toMatch(/lightning_deals_window/);
    const later = await addDeal(c, 3000, { startsAt: at(120 * MIN), endsAt: at(360 * MIN) });
    expect(later.error).toBeNull();
    expect((await addDeal(c, 3000, { startsAt: at(300 * MIN), endsAt: at(420 * MIN) })).error).toMatchObject({ message: 'invalid_input', details: 'starts_at' });
  });

  it('are read by anyone and written by nobody but the store', async () => {
    expect((await anon().from('lightning_deals').select('id').eq('product_id', c)).data).toHaveLength(1);
    const write = await shopper.db.from('lightning_deals').insert({ product_id: a, market_id: 'US', deal_price_minor: 100, quota: 1, starts_at: at(0), ends_at: at(MIN) });
    expect(write.error).not.toBeNull();
    expect((await shopper.db.from('lightning_deals').update({ claimed: 0 }).eq('product_id', c)).error).not.toBeNull();
    expect((await shopper.db.rpc('tick_lightning_deals')).error).not.toBeNull();
    expect((await anon().rpc('plan_lightning_deals')).error).not.toBeNull();
  });

  it('go live at their start: the product takes the deal price, struck against what it cost', async () => {
    const deal = await addDeal(a, 3500, { quota: 3 });
    const listed = await addDeal(b, 3000);
    expect(deal.error ?? listed.error).toBeNull();
    await tick();

    expect(await getProduct(anon(), a)).toMatchObject({ priceMinor: 3500, listMinor: 5000, deal: true, dealPct: 30 });
    // a list price above the old price stays the one struck
    expect(await getProduct(anon(), b)).toMatchObject({ priceMinor: 3000, listMinor: 6000, deal: true, dealPct: 50 });

    const live = (await lightningDealsFor(anon(), [a, b, c])).get(a);
    expect(live).toMatchObject({ id: deal.id, state: 'live', dealPriceMinor: 3500, wasPriceMinor: 5000, quota: 3, claimed: 0 });
    const store = await lightningDeals(anon(), 'US');
    expect(store.live.map((d) => d.productId)).toEqual(expect.arrayContaining([a, b]));
    expect(store.upcoming.map((d) => d.productId)).toContain(c);
  });

  it('claim the units ordered at the deal price, and the last one ends it with the price back', async () => {
    const first = await buy(a, 2);
    expect(first.items[0]).toMatchObject({ productId: a, unitPriceMinor: 3500, qty: 2 });
    const deal = (await lightningDealsFor(anon(), [a])).get(a)!;
    expect(deal).toMatchObject({ state: 'live', claimed: 2 });

    const last = await buy(a, 1);
    expect(last.items[0]).toMatchObject({ unitPriceMinor: 3500 });
    expect(last.totals.subtotalMinor).toBe(3500);
    expect(await dealRow(deal.id)).toMatchObject({ claimed: 3, end_reason: 'sold_out' });
    const after = await getProduct(anon(), a);
    expect(after?.priceMinor).toBe(5000);
    expect(after?.deal).toBeUndefined();
    expect(after?.listMinor).toBeUndefined();
    // sold out until its end, then gone
    expect((await lightningDealsFor(anon(), [a])).get(a)).toMatchObject({ id: deal.id, state: 'sold_out' });
    expect((await lightningDeals(anon(), 'US')).live.map((d) => d.productId)).not.toContain(a);

    const { data } = await admin().from('order_items').select('lightning_deal_id').eq('order_id', last.id).single();
    expect(data?.lightning_deal_id).toBe(deal.id);
  });

  it('end at their time', async () => {
    const deal = (await lightningDealsFor(anon(), [b])).get(b)!;
    await admin().from('lightning_deals').update({ ends_at: at(-1000) }).eq('id', deal.id);
    await tick();
    expect(await dealRow(deal.id)).toMatchObject({ end_reason: 'time' });
    expect(await getProduct(anon(), b)).toMatchObject({ priceMinor: 4000, listMinor: 6000, deal: true, dealPct: 33 });
  });

  it('end when an admin reprices the product, and their price stands', async () => {
    const deal = await addDeal(a, 4000);
    await tick();
    expect((await getProduct(anon(), a))?.priceMinor).toBe(4000);
    await updateProduct(boss.db, a, input(1, { priceMinor: 4500 }));
    expect(await dealRow(deal.id)).toMatchObject({ end_reason: 'repriced' });
    await tick();
    expect((await getProduct(anon(), a))?.priceMinor).toBe(4500);
    await updateProduct(boss.db, a, input(1));
  });

  it('end when the product runs out, and don’t go live on one that has', async () => {
    const deal = await addDeal(a, 4000);
    await tick();
    await admin().from('products').update({ stock: 0 }).eq('id', a);
    await tick();
    expect(await dealRow(deal.id)).toMatchObject({ end_reason: 'unavailable' });
    expect((await getProduct(anon(), a))?.priceMinor).toBe(5000);

    const due = await addDeal(a, 4000);
    await tick();
    expect(await dealRow(due.id)).toMatchObject({ end_reason: 'unavailable', started_at: null });
    await admin().from('products').update({ stock: 20 }).eq('id', a);
  });

  it('are served at /deals/lightning and on the product', async () => {
    const list = await import('@/app/api/v1/deals/lightning/route');
    const one = await import('@/app/api/v1/products/[id]/route');
    const token = (await shopper.db.auth.getSession()).data.session!.access_token;
    const req = (path: string) => new NextRequest(`http://localhost/api/v1${path}`, { headers: { authorization: `Bearer ${token}`, 'x-market': 'US' } });
    const got = (await (await list.GET(req('/deals/lightning'), { params: Promise.resolve({}) })).json()) as {
      upcoming: { deal: { productId: string; dealPriceMinor: number; state: string }; product: { id: string; priceMinor: number } }[];
    };
    const next = got.upcoming.find((u) => u.deal.productId === c);
    expect(next).toMatchObject({ deal: { dealPriceMinor: 3000, state: 'upcoming' }, product: { id: c, priceMinor: 5000 } });
    const detail = (await (await one.GET(req(`/products/${c}`), { params: Promise.resolve({ id: c }) })).json()) as { lightningDeal: { state: string } | null };
    expect(detail.lightningDeal).toMatchObject({ state: 'upcoming' });
  });

  it('are planned two a store an hour ahead', async () => {
    const before = new Set(((await admin().from('lightning_deals').select('id')).data ?? []).map((r) => r.id));
    const { data: planned, error } = await admin().rpc('plan_lightning_deals');
    expect(error).toBeNull();
    const { data: rows } = await admin().from('lightning_deals').select('*').is('started_at', null);
    const fresh = (rows ?? []).filter((r) => !before.has(r.id));
    expect(fresh).toHaveLength(planned ?? -1);
    const { data: products } = await admin().from('products').select('id, price_minor, market_id, offer_of').in('id', fresh.map((r) => r.product_id));
    for (const r of fresh) {
      const p = products!.find((x) => x.id === r.product_id)!;
      const starts = Date.parse(r.starts_at);
      expect(starts - Date.now()).toBeGreaterThan(55 * MIN);
      expect(starts % (60 * MIN)).toBe(0);
      expect(Date.parse(r.ends_at) - starts).toBe(6 * 60 * MIN);
      expect(r.deal_price_minor).toBeLessThan(p.price_minor);
      expect(r.quota).toBeGreaterThanOrEqual(5);
      expect(r.quota).toBeLessThanOrEqual(100);
      expect(r.market_id).toBe(p.market_id);
      expect(p.offer_of).toBeNull();
    }
    // topped up to two a store for that hour, so planning again adds none
    expect((await admin().rpc('plan_lightning_deals')).data).toBe(0);
    if (fresh.length) await admin().from('lightning_deals').delete().in('id', fresh.map((r) => r.id));
  });
});
