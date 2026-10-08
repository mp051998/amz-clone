import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { watchDeal, watchedDeals } from '@/lib/data/deal-watches';
import { listInbox } from '@/lib/data/inbox';
import { admin, anon, deleteUser, newUser, type TestUser } from './helpers';

const tag = crypto.randomUUID().slice(0, 6);
const input = (n: number): ProductInput => ({
  title: `Dw${tag} reading lamp ${n}`,
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
  // under the stock the deal planner and the other tests pick products by
  stock: 12,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
});

const MIN = 60_000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

/** A 3000-minor deal on `product` (service role, as the store's plan does), an hour from now unless said. */
async function addDeal(product: string, market: 'US' | 'IN', startsIn = 60 * MIN) {
  const { data, error } = await admin()
    .from('lightning_deals')
    .insert({ product_id: product, market_id: market, deal_price_minor: 3000, quota: 10, starts_at: at(startsIn), ends_at: at(startsIn + 60 * MIN) })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Bring a deal's start to now and let the store's tick start it. */
async function goLive(id: string) {
  const { error } = await admin().from('lightning_deals').update({ starts_at: at(-MIN) }).eq('id', id);
  if (error) throw error;
  const tick = await admin().rpc('tick_lightning_deals');
  if (tick.error) throw tick.error;
}

const dealMessages = async (u: TestUser, market: 'US' | 'IN') => (await listInbox(u.db, market, u.id)).filter((m) => m.kind === 'deal_live');

let boss: TestUser;
let shopper: TestUser;
let other: TestUser;
let lampUS: string;
let liveUS: string;
let lampIN: string;
// upcoming (until the inbox test starts it), live, and upcoming in the other store
let upcoming: string;
let live: string;
let upcomingIN: string;

beforeAll(async () => {
  boss = await newUser('Dw Admin');
  shopper = await newUser('Dw Shopper');
  other = await newUser('Dw Other');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  lampUS = await createProduct(boss.db, 'US', input(1));
  liveUS = await createProduct(boss.db, 'US', input(2));
  lampIN = await createProduct(boss.db, 'IN', input(3));
  upcoming = await addDeal(lampUS, 'US');
  live = await addDeal(liveUS, 'US');
  await goLive(live);
  upcomingIN = await addDeal(lampIN, 'IN');
});

afterAll(async () => {
  await admin().from('lightning_deals').delete().in('product_id', [lampUS, liveUS, lampIN]);
  await deleteUser(shopper);
  await deleteUser(other);
  await admin().from('products').update({ archived_at: new Date().toISOString() }).in('id', [lampUS, liveUS, lampIN]);
  await deleteUser(boss);
});

describe('Watching a Lightning Deal', () => {
  it('works on an upcoming one, any number of times, and stops', async () => {
    expect(await watchDeal(shopper.db, upcoming)).toBe(true);
    expect(await watchDeal(shopper.db, upcoming)).toBe(true);
    expect([...(await watchedDeals(shopper.db, [upcoming, live]))]).toEqual([upcoming]);

    expect(await watchDeal(shopper.db, upcoming, false)).toBe(false);
    expect(await watchDeal(shopper.db, upcoming, false)).toBe(false);
    expect((await watchedDeals(shopper.db, [upcoming])).size).toBe(0);
    expect(await watchDeal(shopper.db, upcoming)).toBe(true);
  });

  it('is the shopper’s own, and only through the RPC', async () => {
    expect((await watchedDeals(other.db, [upcoming])).size).toBe(0);
    const { data } = await other.db.from('lightning_deal_watches').select('deal_id');
    expect(data ?? []).toEqual([]);
    const forged = await other.db.from('lightning_deal_watches').insert({ user_id: other.id, deal_id: upcoming });
    expect(forged.error).not.toBeNull();
    expect((await watchedDeals(anon(), [upcoming])).size).toBe(0);
  });

  it('is refused for a deal that’s on, one that isn’t there, and guests', async () => {
    await expect(watchDeal(shopper.db, live)).rejects.toMatchObject({ code: 'deal_not_upcoming' });
    await expect(watchDeal(shopper.db, crypto.randomUUID())).rejects.toMatchObject({ code: 'not_found' });
    await expect(watchDeal(shopper.db, 'nope')).rejects.toMatchObject({ code: 'not_found' });
    expect((await anon().rpc('watch_lightning_deal', { p_deal: upcoming })).error).not.toBeNull();
    // unwatching one that's on is fine
    expect(await watchDeal(shopper.db, live, false)).toBe(false);
  });

  it('is served at /deals/lightning/:id/watch, and on the deal and product reads', async () => {
    const watch = await import('@/app/api/v1/deals/lightning/[id]/watch/route');
    const list = await import('@/app/api/v1/deals/lightning/route');
    const one = await import('@/app/api/v1/products/[id]/route');
    const token = (await other.db.auth.getSession()).data.session!.access_token;
    const req = (path: string, method = 'GET') =>
      new NextRequest(`http://localhost/api/v1${path}`, { method, headers: { authorization: `Bearer ${token}`, 'x-market': 'US' } });
    const params = { params: Promise.resolve({ id: upcoming }) };

    const on = await watch.POST(req(`/deals/lightning/${upcoming}/watch`, 'POST'), params);
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ watching: true });
    const deals = (await (await list.GET(req('/deals/lightning'), { params: Promise.resolve({}) })).json()) as { watching: string[] };
    expect(deals.watching).toContain(upcoming);
    const detail = (await (await one.GET(req(`/products/${lampUS}`), { params: Promise.resolve({ id: lampUS }) })).json()) as { watchingDeal: boolean };
    expect(detail.watchingDeal).toBe(true);

    const refused = await watch.POST(req(`/deals/lightning/${live}/watch`, 'POST'), { params: Promise.resolve({ id: live }) });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: { code: 'deal_not_upcoming' } });

    const off = await watch.DELETE(req(`/deals/lightning/${upcoming}/watch`, 'DELETE'), params);
    expect(await off.json()).toEqual({ watching: false });
    const after = (await (await list.GET(req('/deals/lightning'), { params: Promise.resolve({}) })).json()) as { watching: string[] };
    expect(after.watching).not.toContain(upcoming);
  });

  it('puts the deal in the watcher’s messages when it goes live, and says when it’s over', async () => {
    expect(await watchDeal(shopper.db, upcomingIN)).toBe(true);
    expect(await dealMessages(shopper, 'US')).toEqual([]);

    await goLive(upcoming);
    const [msg] = await dealMessages(shopper, 'US');
    expect(msg).toMatchObject({ key: `deal_live:${upcoming}`, subject: `Dw${tag} reading lamp 1`, href: `/product/${lampUS}`, amountMinor: 3000 });
    expect(msg.over).toBeUndefined();
    // not for those who didn't watch it, nor in the other store
    expect(await dealMessages(other, 'US')).toEqual([]);
    expect(await dealMessages(shopper, 'IN')).toEqual([]);

    const cancel = await boss.db.rpc('cancel_lightning_deal', { p_id: upcoming });
    if (cancel.error) throw cancel.error;
    expect(await dealMessages(shopper, 'US')).toMatchObject([{ key: `deal_live:${upcoming}`, over: true }]);

    await goLive(upcomingIN);
    expect(await dealMessages(shopper, 'IN')).toMatchObject([{ key: `deal_live:${upcomingIN}`, href: `/product/${lampIN}` }]);
  });

  it('goes with the deal', async () => {
    await admin().from('lightning_deals').delete().eq('id', upcomingIN);
    const { count } = await admin().from('lightning_deal_watches').select('*', { count: 'exact', head: true }).eq('deal_id', upcomingIN);
    expect(count).toBe(0);
  });
});
