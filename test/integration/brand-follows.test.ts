import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { followBrand, followedBrandFeed, followedBrands, isFollowingBrand, unfollowBrand } from '@/lib/data/brand-follows';
import { DataError } from '@/lib/data/errors';
import { admin, anon, deleteUser, newUser, type TestUser } from './helpers';

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}${err.detail ? `:${err.detail}` : ''}` : String(err);
  }
  return 'no error';
};

let me: TestUser;
let other: TestUser;
/** Two brands on sale in the US store and nowhere in India's. */
let usOnly: [string, string];

beforeAll(async () => {
  [me, other] = await Promise.all([newUser('Brand Follower'), newUser('Brand Other')]);
  const { data, error } = await admin().from('products').select('brand, market_id').not('brand', 'is', null).is('archived_at', null);
  if (error) throw error;
  const inBrands = new Set(data.filter((r) => r.market_id === 'IN').map((r) => r.brand));
  const us = [...new Set(data.filter((r) => r.market_id === 'US' && !inBrands.has(r.brand)).map((r) => r.brand!))].sort();
  if (us.length < 2) throw new Error('not enough US-only brands');
  usOnly = [us[0], us[1]];
});

afterAll(async () => {
  await Promise.all([deleteUser(me), deleteUser(other)]);
});

describe('brand follows', () => {
  it('follows a brand on sale in the store, newest follow first, again keeping the first date', async () => {
    const [a, b] = usOnly;
    expect(await followBrand(me.db, 'US', `  ${a} `)).toBe(a);
    const first = (await followedBrands(me.db, 'US', me.id))[0];
    expect(first.brand).toBe(a);
    expect(await followBrand(me.db, 'US', b)).toBe(b);
    expect(await followBrand(me.db, 'US', a)).toBe(a);
    const follows = await followedBrands(me.db, 'US', me.id);
    expect(follows.map((f) => f.brand)).toEqual([b, a]);
    expect(follows[1].followedAt).toBe(first.followedAt);
    expect(await isFollowingBrand(me.db, 'US', me.id, a)).toBe(true);

    // what's new from each
    const feed = await followedBrandFeed(me.db, 'US', me.id);
    expect(feed.map((f) => f.brand)).toEqual([b, a]);
    expect(feed.every((f) => f.products.length > 0 && f.products.length <= 4 && f.products.every((p) => p.brand === f.brand && p.market === 'US'))).toBe(true);
  });

  it('refuses a brand with nothing on sale in that store', async () => {
    expect(await failure(followBrand(me.db, 'IN', usOnly[0]))).toBe('not_found:brand');
    expect(await failure(followBrand(me.db, 'US', 'No Such Brand Anywhere'))).toBe('not_found:brand');
    expect(await followedBrands(me.db, 'IN', me.id)).toEqual([]);
  });

  it('keeps each shopper’s follows their own, written only through the functions', async () => {
    expect(await followedBrands(other.db, 'US', other.id)).toEqual([]);
    expect(await followedBrands(other.db, 'US', me.id)).toEqual([]);
    expect(await isFollowingBrand(other.db, 'US', me.id, usOnly[0])).toBe(false);
    const forged = await other.db.from('brand_follows').insert({ user_id: other.id, market_id: 'US', brand: usOnly[0] });
    expect(forged.error).toBeTruthy();
    expect((await anon().rpc('follow_brand', { p_market: 'US', p_brand: usOnly[0] })).error).toBeTruthy();
    expect((await anon().from('brand_follows').select('brand')).data ?? []).toEqual([]);
  });

  it('unfollows, saying whether it was followed', async () => {
    const [a, b] = usOnly;
    expect(await unfollowBrand(me.db, 'US', b)).toBe(true);
    expect(await unfollowBrand(me.db, 'US', b)).toBe(false);
    expect((await followedBrands(me.db, 'US', me.id)).map((f) => f.brand)).toEqual([a]);
  });

  it('serves them at /me/brands', async () => {
    const { GET, PUT, DELETE } = await import('@/app/api/v1/me/brands/route');
    const token = (await me.db.auth.getSession()).data.session!.access_token;
    // a bearer token: the cookie client needs a Next request scope
    const req = (method: string, path = '', body?: unknown) =>
      new NextRequest(`http://localhost/api/v1/me/brands${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-market': 'US' },
        body: body ? JSON.stringify(body) : undefined,
      });
    const ctx = { params: Promise.resolve({}) };
    const put = await PUT(req('PUT', '', { brand: usOnly[1] }), ctx);
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ brand: usOnly[1] });
    const got = (await (await GET(req('GET'), ctx)).json()) as { brands: { brand: string }[] };
    expect(got.brands.map((x) => x.brand)).toEqual([usOnly[1], usOnly[0]]);
    expect((await DELETE(req('DELETE', `?brand=${encodeURIComponent(usOnly[1])}`), ctx)).status).toBe(204);
    expect((await PUT(req('PUT', '', { brand: 'No Such Brand Anywhere' }), ctx)).status).toBe(404);
  });
});
