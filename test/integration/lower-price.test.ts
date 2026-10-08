import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { DataError } from '@/lib/data/errors';
import { listPriceReportQueue, myOpenPriceReport, reportLowerPrice, reviewPriceReports } from '@/lib/data/lower-price';
import { admin, deleteUser, newUser, type TestUser } from './helpers';

/** What a call failed with, as `code:detail` (or 'no error'). */
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
  return 'no error';
};

let boss: TestUser;
let asha: TestUser;
let ben: TestUser;
let kettle: { id: string; price_minor: number };
let lamp: { id: string; price_minor: number };
const today = new Date().toISOString().slice(0, 10);

const tag = crypto.randomUUID().slice(0, 6);
const product = (title: string, priceMinor: number): ProductInput => ({
  title: `${title} ${tag}`,
  brand: null,
  category: 'electronics',
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

beforeAll(async () => {
  [boss, asha, ben] = await Promise.all([newUser('Lower Price Admin'), newUser('Lower Price Asha'), newUser('Lower Price Ben')]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  kettle = { id: await createProduct(boss.db, 'US', product('Lower price kettle', 4999)), price_minor: 4999 };
  lamp = { id: await createProduct(boss.db, 'US', product('Lower price lamp', 2999)), price_minor: 2999 };
});

afterAll(async () => {
  const ids = [kettle?.id, lamp?.id].filter(Boolean);
  if (ids.length) await admin().from('products').delete().in('id', ids);
  await Promise.all([deleteUser(boss), deleteUser(asha), deleteUser(ben)]);
});

const online = (priceMinor: number, shippingMinor = 0) => ({ seenAt: 'online', priceMinor, shippingMinor, url: 'https://www.example.com/kettle' });

describe('telling the store about a lower price', () => {
  it('a shopper reports one, and telling it again rewrites theirs', async () => {
    const first = await reportLowerPrice(asha.db, kettle.id, online(kettle.price_minor - 300, 100));
    expect(first.updated).toBe(false);
    expect(first.report).toMatchObject({ productId: kettle.id, ourPriceMinor: kettle.price_minor, seenAt: 'online', priceMinor: kettle.price_minor - 300, shippingMinor: 100, status: 'open' });

    const again = await reportLowerPrice(asha.db, kettle.id, { seenAt: 'store', priceMinor: kettle.price_minor - 500, store: ' Corner Shop ', city: 'Austin', seenOn: today });
    expect(again.updated).toBe(true);
    expect(again.report).toMatchObject({ id: first.report.id, seenAt: 'store', url: null, storeName: 'Corner Shop', city: 'Austin', seenOn: today, shippingMinor: 0 });
    expect((await myOpenPriceReport(asha.db, kettle.id, asha.id))?.id).toBe(first.report.id);
  });

  it('only a lower price, from a real page or a shop on a recent day', async () => {
    expect(await failure(reportLowerPrice(ben.db, kettle.id, online(kettle.price_minor)))).toBe('invalid_input:price');
    expect(await failure(reportLowerPrice(ben.db, kettle.id, online(kettle.price_minor - 100, 100)))).toBe('invalid_input:price');
    expect(await failure(reportLowerPrice(ben.db, kettle.id, { ...online(100), url: 'javascript:alert(1)' }))).toBe('invalid_input:url');
    expect(await failure(reportLowerPrice(ben.db, kettle.id, { seenAt: 'store', priceMinor: 100, store: 'Shop', seenOn: '2020-01-01' }))).toBe('invalid_input:seen_on');
    expect(await failure(reportLowerPrice(ben.db, 'no-such-product', online(100)))).toBe('product_not_found:');
    // the database checks the same, whatever a client sends
    const { error } = await ben.db.rpc('report_lower_price', { p_product: kettle.id, p_seen_at: 'online', p_price_minor: kettle.price_minor, p_url: 'https://example.com/x' });
    expect([error?.message, error?.details]).toEqual(['invalid_input', 'price']);
    const direct = await ben.db.from('price_reports').insert({ product_id: kettle.id, our_price_minor: 10, seen_at: 'online', url: 'https://a.co', price_minor: 1 });
    expect(direct.error).not.toBeNull();
  });

  it('shoppers see only their own', async () => {
    await reportLowerPrice(ben.db, kettle.id, online(kettle.price_minor - 200));
    expect(await myOpenPriceReport(ben.db, kettle.id, asha.id)).toBeNull();
    const { data } = await ben.db.from('price_reports').select('user_id').eq('product_id', kettle.id);
    expect(data).toEqual([{ user_id: ben.id }]);
  });
});

describe('admins', () => {
  it('see each product’s reports together, lowest first, and mark them reviewed', async () => {
    const q = await listPriceReportQueue(boss.db, 'US');
    const row = q.products.find((p) => p.productId === kettle.id)!;
    expect(row.reports.map((r) => r.priceMinor + r.shippingMinor)).toEqual([kettle.price_minor - 500, kettle.price_minor - 200]);
    expect(row).toMatchObject({ priceMinor: kettle.price_minor, lowestMinor: kettle.price_minor - 500 });
    expect(q.counts.open).toBeGreaterThanOrEqual(2);
    expect((await listPriceReportQueue(boss.db, 'IN')).products.find((p) => p.productId === kettle.id)).toBeUndefined();
    // shoppers get nothing from the queue
    expect((await listPriceReportQueue(asha.db, 'US')).products.map((p) => p.productId)).toEqual([kettle.id]);

    expect(await failure(reviewPriceReports(asha.db, 'US', kettle.id))).toBe('forbidden:');
    expect(await failure(reviewPriceReports(boss.db, 'IN', kettle.id))).toBe('product_not_found:');
    expect(await reviewPriceReports(boss.db, 'US', kettle.id)).toBe(2);
    expect(await reviewPriceReports(boss.db, 'US', kettle.id)).toBe(0);
    const reviewed = await listPriceReportQueue(boss.db, 'US', { view: 'reviewed' });
    expect(reviewed.products.find((p) => p.productId === kettle.id)?.reports.every((r) => r.status === 'reviewed' && r.reviewedAt)).toBe(true);

    // a shopper can tell us again after that: a new report
    expect(await myOpenPriceReport(asha.db, kettle.id, asha.id)).toBeNull();
    expect((await reportLowerPrice(asha.db, kettle.id, online(kettle.price_minor - 50))).updated).toBe(false);
  });
});

describe('API', () => {
  it('serves /products/:id/lower-price and /admin/lower-prices', async () => {
    const tell = await import('@/app/api/v1/products/[id]/lower-price/route');
    const list = await import('@/app/api/v1/admin/lower-prices/route');
    const done = await import('@/app/api/v1/admin/lower-prices/[productId]/reviewed/route');
    const token = async (u: TestUser) => (await u.db.auth.getSession()).data.session!.access_token;
    const req = (path: string, as: string, init: { method?: string; body?: unknown } = {}) =>
      new NextRequest(`http://localhost/api/v1${path}`, {
        method: init.method ?? 'GET',
        headers: { authorization: `Bearer ${as}`, 'x-market': 'US', 'content-type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    const [b, s] = [await token(boss), await token(ben)];
    const at = { params: Promise.resolve({ id: lamp.id }) };

    const made = await tell.POST(req(`/products/${lamp.id}/lower-price`, s, { method: 'POST', body: online(lamp.price_minor - 100) }), at);
    expect(made.status).toBe(201);
    expect(((await made.json()) as { report: { priceMinor: number } }).report.priceMinor).toBe(lamp.price_minor - 100);
    const redo = await tell.POST(req(`/products/${lamp.id}/lower-price`, s, { method: 'POST', body: online(lamp.price_minor - 150) }), at);
    expect([redo.status, ((await redo.json()) as { updated: boolean }).updated]).toEqual([200, true]);
    const bad = await tell.POST(req(`/products/${lamp.id}/lower-price`, s, { method: 'POST', body: online(lamp.price_minor + 1) }), at);
    expect(bad.status).toBe(422);

    expect((await list.GET(req('/admin/lower-prices', s), { params: Promise.resolve({}) })).status).toBe(403);
    const got = await list.GET(req('/admin/lower-prices', b), { params: Promise.resolve({}) });
    const body = (await got.json()) as { products: { productId: string; reports: unknown[] }[] };
    expect(body.products.find((p) => p.productId === lamp.id)?.reports).toHaveLength(1);

    const marked = await done.POST(req(`/admin/lower-prices/${lamp.id}/reviewed`, b, { method: 'POST' }), { params: Promise.resolve({ productId: lamp.id }) });
    expect(await marked.json()).toEqual({ reviewed: 1 });
  });
});
