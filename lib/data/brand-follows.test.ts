import { expect, it, vi } from 'vitest';
import type { Db } from '../db/client';
import { product } from '@/test/fixtures/decision';

const listed = vi.hoisted(() => ({ asked: [] as unknown[], fail: '' }));
vi.mock('server-only', () => ({}));
vi.mock('./catalog', () => ({
  listProducts: async (_db: unknown, market: string, opts: { brand: string }) => {
    listed.asked.push([market, opts]);
    if (opts.brand === listed.fail) throw new Error('down');
    return [product({ id: `${opts.brand}-1`, brand: opts.brand })];
  },
}));

import { followBrand, followedBrandFeed, followedBrands, isFollowingBrand, unfollowBrand } from './brand-follows';

type Reply = { data: unknown; error: unknown };

/** A client answering reads with `read` and RPCs with `rpcReply`, recording both. */
function fakeDb(read: Reply, rpcReply: Reply = { data: null, error: null }) {
  const ops: [string, unknown[]][] = [];
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'maybeSingle']) {
    q[m] = (...args: unknown[]) => {
      ops.push([m, args]);
      return q;
    };
  }
  q.then = (resolve: (r: Reply) => unknown) => resolve(read);
  const rpc = vi.fn(async () => rpcReply);
  const db = { from: (table: string) => (ops.push(['from', [table]]), q), rpc };
  return { db: db as unknown as Db, ops, rpc };
}

it('lists the shopper’s follows in a store, newest first', async () => {
  const { db, ops } = fakeDb({ data: [{ brand: 'Acme', followed_at: '2026-10-01T00:00:00Z' }], error: null });
  expect(await followedBrands(db, 'US', 'u1')).toEqual([{ brand: 'Acme', followedAt: '2026-10-01T00:00:00Z' }]);
  expect(ops).toEqual([
    ['from', ['brand_follows']],
    ['select', ['brand, followed_at']],
    ['eq', ['user_id', 'u1']],
    ['eq', ['market_id', 'US']],
    ['order', ['followed_at', { ascending: false }]],
    ['limit', [50]],
  ]);
});

it('says whether the shopper follows a brand', async () => {
  const yes = fakeDb({ data: { brand: 'Acme' }, error: null });
  expect(await isFollowingBrand(yes.db, 'IN', 'u1', 'Acme')).toBe(true);
  expect(yes.ops).toContainEqual(['eq', ['brand', 'Acme']]);
  expect(await isFollowingBrand(fakeDb({ data: null, error: null }).db, 'IN', 'u1', 'Acme')).toBe(false);
});

it('gives each brand followed its newest products, and none when they can’t be read', async () => {
  listed.asked = [];
  listed.fail = 'Gone';
  const { db } = fakeDb({ data: [{ brand: 'Acme', followed_at: '2026-10-02T00:00:00Z' }, { brand: 'Gone', followed_at: '2026-10-01T00:00:00Z' }], error: null });
  const feed = await followedBrandFeed(db, 'US', 'u1');
  expect(feed.map((f) => [f.brand, f.products.map((p) => p.id)])).toEqual([
    ['Acme', ['Acme-1']],
    ['Gone', []],
  ]);
  expect(listed.asked).toEqual([
    ['US', { brand: 'Acme', order: 'fresh', limit: 4 }],
    ['US', { brand: 'Gone', order: 'fresh', limit: 4 }],
  ]);
});

it('follows by the trimmed name, and words a brand with nothing on sale', async () => {
  const ok = fakeDb({ data: null, error: null }, { data: 'Acme', error: null });
  expect(await followBrand(ok.db, 'US', '  Acme ')).toBe('Acme');
  expect(ok.rpc).toHaveBeenCalledWith('follow_brand', { p_market: 'US', p_brand: 'Acme' });

  const none = fakeDb({ data: null, error: null }, { data: null, error: { message: 'not_found', details: 'brand', code: 'P0002' } });
  const err = await followBrand(none.db, 'US', 'Nobody').catch((e) => e);
  expect([err.code, err.detail, err.message, err.status]).toEqual(['not_found', 'brand', 'Nothing from that brand is on sale in this store.', 404]);
});

it('turns away an empty or overlong name before asking', async () => {
  const { db, rpc } = fakeDb({ data: null, error: null });
  for (const bad of ['', '   ', null, 42, 'x'.repeat(121)]) {
    const err = await followBrand(db, 'US', bad).catch((e) => e);
    expect([err.code, err.detail]).toEqual(['invalid_input', 'brand']);
    expect((await unfollowBrand(db, 'US', bad).catch((e) => e)).code).toBe('invalid_input');
  }
  expect(rpc).not.toHaveBeenCalled();
});

it('unfollows, saying whether it was followed', async () => {
  const { db, rpc } = fakeDb({ data: null, error: null }, { data: true, error: null });
  expect(await unfollowBrand(db, 'IN', ' Acme')).toBe(true);
  expect(rpc).toHaveBeenCalledWith('unfollow_brand', { p_market: 'IN', p_brand: 'Acme' });
});
