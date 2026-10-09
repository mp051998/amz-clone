import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import {
  cancelLightningDeal,
  getAdminLightningDeal,
  listAdminLightningDeals,
  openDealsOf,
  scheduleLightningDeal,
} from '@/lib/data/admin-lightning-deals';
import { getProduct } from '@/lib/data/catalog';
import { lightningDealsFor } from '@/lib/data/lightning-deals';
import { admin, anon, deleteUser, newUser, type TestUser } from './helpers';

const tag = crypto.randomUUID().slice(0, 6);
const input = (n: number, over: Partial<ProductInput> = {}): ProductInput => ({
  title: `Ald${tag} reading lamp ${n}`,
  brand: 'Lumen',
  category: 'home-kitchen',
  image: '/products/placeholder.jpg',
  priceMinor: 6000,
  listMinor: null,
  deal: false,
  couponPct: null,
  maxPerCustomer: null,
  sizes: null,
  unit: null,
  qtyDiscount: null,
  releaseAt: null,
  badge: null,
  seller: 'Lumen Store',
  shipsFrom: 'Amazon',
  bullets: ['Warm light'],
  description: null,
  details: [],
  // under the stock the other tests pick products by, and the store plans deals on
  stock: 12,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
  ...over,
});

const HOUR = 3_600_000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

let boss: TestUser;
let shopper: TestUser;
// a: scheduled ahead; b: live from now; c: in India
let a: string;
let b: string;
let c: string;

beforeAll(async () => {
  boss = await newUser('Ald Admin');
  shopper = await newUser('Ald Shopper');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  a = await createProduct(boss.db, 'US', input(1));
  b = await createProduct(boss.db, 'US', input(2));
  c = await createProduct(boss.db, 'IN', input(3, { priceMinor: 250_000 }));
});

afterAll(async () => {
  await admin().from('lightning_deals').delete().in('product_id', [a, b, c]);
  await deleteUser(shopper);
  await admin().from('products').update({ archived_at: new Date().toISOString() }).in('id', [a, b, c]);
  await deleteUser(boss);
});

describe('Admin Lightning Deals', () => {
  it('are for admins only', async () => {
    await expect(scheduleLightningDeal(shopper.db, { productId: a, dealPriceMinor: 4000, quota: 5, startsAt: null, hours: 2 })).rejects.toMatchObject({ code: 'forbidden' });
    const { error } = await anon().rpc('schedule_lightning_deal', { p_product: a, p_deal_price_minor: 4000, p_quota: 5, p_starts_at: null, p_hours: 2 });
    expect(error).not.toBeNull();
  });

  it('refuse a price not below, more units than in stock, a passed start, an overlap and over 12 hours', async () => {
    const deal = { productId: a, dealPriceMinor: 4000, quota: 5, startsAt: null, hours: 2 };
    await expect(scheduleLightningDeal(boss.db, { ...deal, dealPriceMinor: 6000 })).rejects.toMatchObject({ code: 'invalid_input', detail: 'deal_price_minor' });
    await expect(scheduleLightningDeal(boss.db, { ...deal, quota: 13 })).rejects.toMatchObject({ code: 'invalid_input', detail: 'quota' });
    await expect(scheduleLightningDeal(boss.db, { ...deal, startsAt: at(-HOUR) })).rejects.toMatchObject({ code: 'invalid_input', detail: 'starts_at' });
    await expect(scheduleLightningDeal(boss.db, { ...deal, hours: 13 })).rejects.toMatchObject({ code: 'invalid_input', detail: 'hours' });
    await expect(scheduleLightningDeal(boss.db, { ...deal, productId: 'nope' })).rejects.toMatchObject({ code: 'product_not_found' });
  });

  it('start later, or now and live at once', async () => {
    const later = await scheduleLightningDeal(boss.db, { productId: a, dealPriceMinor: 4500, quota: 5, startsAt: at(3 * HOUR), hours: 4 });
    await expect(scheduleLightningDeal(boss.db, { productId: a, dealPriceMinor: 4000, quota: 5, startsAt: at(5 * HOUR), hours: 2 })).rejects.toMatchObject({ detail: 'overlap' });
    const upcoming = await getAdminLightningDeal(boss.db, 'US', later);
    expect(upcoming).toMatchObject({ productId: a, title: input(1).title, dealPriceMinor: 4500, wasPriceMinor: 6000, quota: 5, startedAt: null, byAdmin: true });
    expect(Date.parse(upcoming!.endsAt) - Date.parse(upcoming!.startsAt)).toBe(4 * HOUR);
    expect((await getProduct(anon(), a))?.priceMinor).toBe(6000);

    const now = await scheduleLightningDeal(boss.db, { productId: b, dealPriceMinor: 4200, quota: 8, startsAt: null, hours: 2 });
    expect(await getAdminLightningDeal(boss.db, 'US', now)).toMatchObject({ startedAt: expect.any(String), wasPriceMinor: 6000, byAdmin: true });
    expect(await getProduct(anon(), b)).toMatchObject({ priceMinor: 4200, listMinor: 6000, deal: true, dealPct: 30 });
    // shoppers see both
    const seen = await lightningDealsFor(anon(), [a, b]);
    expect(seen.get(a)).toMatchObject({ id: later, state: 'upcoming' });
    expect(seen.get(b)).toMatchObject({ id: now, state: 'live' });

    const live = await listAdminLightningDeals(boss.db, 'US', 'live');
    expect(live.deals.find((d) => d.id === now)).toMatchObject({ productId: b, claimed: 0 });
    expect(live.counts.live).toBeGreaterThanOrEqual(1);
    expect((await listAdminLightningDeals(boss.db, 'US', 'upcoming')).deals.map((d) => d.id)).toContain(later);
    expect((await openDealsOf(boss.db, a)).map((d) => d.id)).toEqual([later]);
  });

  it('cancel: an upcoming one won’t start, a live one ends and its price goes back', async () => {
    const [later] = await openDealsOf(boss.db, a);
    const [now] = await openDealsOf(boss.db, b);
    await expect(cancelLightningDeal(shopper.db, now.id)).rejects.toMatchObject({ code: 'forbidden' });

    await cancelLightningDeal(boss.db, later.id);
    await cancelLightningDeal(boss.db, now.id);
    // again: stays as it ended
    await cancelLightningDeal(boss.db, now.id);
    expect(await getAdminLightningDeal(boss.db, 'US', later.id)).toMatchObject({ endReason: 'cancelled', startedAt: null });
    expect(await getAdminLightningDeal(boss.db, 'US', now.id)).toMatchObject({ endReason: 'cancelled', endedAt: expect.any(String) });
    const back = await getProduct(anon(), b);
    expect(back?.priceMinor).toBe(6000);
    expect(back?.deal).toBeUndefined();
    expect((await lightningDealsFor(anon(), [a, b])).size).toBe(0);
    expect((await listAdminLightningDeals(boss.db, 'US', 'ended')).deals.map((d) => d.id)).toEqual(expect.arrayContaining([later.id, now.id]));
    await expect(cancelLightningDeal(boss.db, crypto.randomUUID())).rejects.toMatchObject({ code: 'not_found' });
  });

  it('are served at /admin/lightning-deals, in their own store', async () => {
    const list = await import('@/app/api/v1/admin/lightning-deals/route');
    const cancel = await import('@/app/api/v1/admin/lightning-deals/[id]/cancel/route');
    const token = (await boss.db.auth.getSession()).data.session!.access_token;
    const req = (path: string, market: 'US' | 'IN', init: { method?: string; body?: unknown } = {}) =>
      new NextRequest(`http://localhost/api/v1${path}`, {
        method: init.method ?? 'GET',
        headers: { authorization: `Bearer ${token}`, 'x-market': market, 'content-type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });

    const made = await list.POST(req('/admin/lightning-deals', 'IN', { method: 'POST', body: { productId: c, dealPriceMinor: 199_900, quota: 4, hours: 3, startsAt: at(2 * HOUR) } }), { params: Promise.resolve({}) });
    expect(made.status).toBe(201);
    const { deal } = (await made.json()) as { deal: { id: string; productId: string; startedAt: string | null } };
    expect(deal).toMatchObject({ productId: c, startedAt: null });

    // the other store's product, and a bad body
    expect((await list.POST(req('/admin/lightning-deals', 'US', { method: 'POST', body: { productId: c, dealPriceMinor: 1000, quota: 1, hours: 1 } }), { params: Promise.resolve({}) })).status).toBe(404);
    const bad = await list.POST(req('/admin/lightning-deals', 'IN', { method: 'POST', body: { productId: c, dealPriceMinor: 1000, quota: 1.5, hours: 1 } }), { params: Promise.resolve({}) });
    expect(bad.status).toBe(422);

    const upcoming = (await (await list.GET(req('/admin/lightning-deals?view=upcoming', 'IN'), { params: Promise.resolve({}) })).json()) as { view: string; deals: { id: string }[] };
    expect(upcoming.view).toBe('upcoming');
    expect(upcoming.deals.map((d) => d.id)).toContain(deal.id);

    expect((await cancel.POST(req(`/admin/lightning-deals/${deal.id}/cancel`, 'US', { method: 'POST' }), { params: Promise.resolve({ id: deal.id }) })).status).toBe(404);
    const done = await cancel.POST(req(`/admin/lightning-deals/${deal.id}/cancel`, 'IN', { method: 'POST' }), { params: Promise.resolve({ id: deal.id }) });
    expect(((await done.json()) as { deal: { endReason: string } }).deal.endReason).toBe('cancelled');
  });
});
