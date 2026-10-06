import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { product } from '@/test/fixtures/decision';
import { getSharedList, isShareToken, listChoices, markSharedGift, moveItem, priceDrops, shareCollection, unshareCollection } from './collections';

const TOKEN = '0123456789abcdef0123456789abcdef';

/** rpc answers from a map; product reads answer with the given rows. */
function fakeDb(rpc: Record<string, { data: unknown; error: unknown }>, products: Record<string, unknown>[] = []) {
  const rpcs: [string, unknown][] = [];
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'is', 'eq', 'order']) q[m] = () => q;
  q.then = (resolve: (r: unknown) => unknown) => resolve({ data: products, error: null });
  const db = {
    rpc: async (fn: string, args: unknown) => {
      rpcs.push([fn, args]);
      return rpc[fn] ?? { data: null, error: null };
    },
    from: () => q,
  };
  return { db: db as unknown as Db, rpcs };
}

it('only asks the database about well-formed links and ids', async () => {
  const { db, rpcs } = fakeDb({});
  expect(isShareToken(TOKEN)).toBe(true);
  expect(isShareToken(TOKEN.toUpperCase())).toBe(false);
  expect(await getSharedList(db, '../etc')).toBeNull();
  await expect(shareCollection(db, 'nope')).rejects.toMatchObject({ code: 'collection_not_found' });
  await expect(unshareCollection(db, 'nope')).rejects.toMatchObject({ code: 'collection_not_found' });
  expect(rpcs).toEqual([]);
});

it('reads a shared list, or null when the link is off', async () => {
  const off = fakeDb({ shared_collection: { data: null, error: null } });
  expect(await getSharedList(off.db, TOKEN)).toBeNull();
  expect(off.rpcs).toEqual([['shared_collection', { p_token: TOKEN }]]);

  const on = fakeDb({
    shared_collection: {
      data: { name: 'Baby registry', kind: 'custom', market_id: 'IN', shared_at: '2026-10-05T10:00:00Z', owner_name: '', mine: false, collection_id: null, items: [] },
      error: null,
    },
  });
  expect(await getSharedList(on.db, TOKEN)).toMatchObject({ token: TOKEN, name: 'Baby registry', market: 'IN', ownerName: 'Customer', products: [] });
});

it('reads gift givers’ marks off a shared list', async () => {
  const items = [
    { product_id: 'a', added_at: '2026-10-05', bought: 'you' },
    { product_id: 'b', added_at: '2026-10-04', bought: null },
    { product_id: 'c', added_at: '2026-10-03', bought: 'someone' },
    { product_id: 'd', added_at: '2026-10-02', bought: 'anyone' },
  ];
  const { db } = fakeDb({
    shared_collection: { data: { name: 'Wedding', kind: 'custom', market_id: 'US', shared_at: '2026-10-05T10:00:00Z', owner_name: 'Asha', mine: false, collection_id: null, items }, error: null },
  });
  expect((await getSharedList(db, TOKEN))!.bought).toEqual({ a: 'you', c: 'someone' });
});

it('marks a shared list item bought only for a well-formed link and product', async () => {
  const { db, rpcs } = fakeDb({});
  await expect(markSharedGift(db, 'nope', 'p1', true)).rejects.toMatchObject({ code: 'collection_not_found' });
  await expect(markSharedGift(db, TOKEN, '', true)).rejects.toMatchObject({ code: 'item_not_found' });
  expect(rpcs).toEqual([]);
  await markSharedGift(db, TOKEN, 'p1', true);
  await markSharedGift(db, TOKEN, 'p1', false);
  expect(rpcs).toEqual([
    ['mark_shared_gift', { p_token: TOKEN, p_product: 'p1', p_bought: true }],
    ['mark_shared_gift', { p_token: TOKEN, p_product: 'p1', p_bought: false }],
  ]);
});

it('shares by id and hands back the link token', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const { db, rpcs } = fakeDb({ share_collection: { data: { token: TOKEN, shared_at: '2026-10-05T10:00:00Z' }, error: null } });
  expect(await shareCollection(db, id)).toEqual({ token: TOKEN, sharedAt: '2026-10-05T10:00:00Z' });
  expect(rpcs).toEqual([['share_collection', { p_collection: id }]]);
});

it('moves between two lists by id, and never onto the same list', async () => {
  const a = '00000000-0000-4000-8000-000000000001';
  const b = '00000000-0000-4000-8000-000000000002';
  const { db, rpcs } = fakeDb({});
  await expect(moveItem(db, 'nope', b, 'p1')).rejects.toMatchObject({ code: 'collection_not_found' });
  await expect(moveItem(db, a, a, 'p1')).rejects.toMatchObject({ code: 'invalid_input', message: 'Pick a different list.' });
  expect(rpcs).toEqual([]);
  await moveItem(db, a, b, 'p1');
  expect(rpcs).toEqual([['move_collection_item', { p_from: a, p_to: b, p_product: 'p1' }]]);
});

it('lists the shopper’s lists in Collections order, ticking the ones that hold the product', async () => {
  const rows = [
    { id: 'l', name: 'Saved for later', kind: 'later', position: 0, created_at: '2026-10-01', collection_items: [{ product_id: 'p1' }] },
    { id: 'b', name: 'Birthday', kind: 'custom', position: 0, created_at: '2026-10-03', collection_items: [] },
    { id: 'c', name: "Things I'm Considering", kind: 'considering', position: 0, created_at: '2026-10-04', collection_items: [] },
    { id: 'a', name: 'Apartment', kind: 'custom', position: 0, created_at: '2026-10-02', collection_items: [{ product_id: 'p1' }] },
  ];
  const { db } = fakeDb({}, rows);
  expect(await listChoices(db, 'US', 'p1')).toEqual([
    { id: 'c', name: "Things I'm Considering", kind: 'considering', has: false },
    { id: 'a', name: 'Apartment', kind: 'custom', has: true },
    { id: 'b', name: 'Birthday', kind: 'custom', has: false },
    { id: 'l', name: 'Saved for later', kind: 'later', has: true },
  ]);
});

it('finds what got cheaper since it was saved, biggest share first, each product once', () => {
  const kettle = product({ id: 'kettle', priceMinor: 4000 });
  const lamp = product({ id: 'lamp', priceMinor: 900 });
  const drops = priceDrops([
    { product: kettle, savedPriceMinor: 4500 },
    { product: kettle, savedPriceMinor: 5000 }, // on two lists: the higher saved price counts
    { product: lamp, savedPriceMinor: 1000 },
    { product: product({ id: 'same', priceMinor: 700 }), savedPriceMinor: 700 },
    { product: product({ id: 'up', priceMinor: 800 }), savedPriceMinor: 700 },
    { product: product({ id: 'gone', priceMinor: 100, archived: true }), savedPriceMinor: 700 },
    { product: product({ id: 'sold-out', priceMinor: 100, stock: 0 }), savedPriceMinor: 700 },
  ]);
  expect(drops.map((d) => [d.product.id, d.savedPriceMinor, d.dropMinor])).toEqual([
    ['kettle', 5000, 1000],
    ['lamp', 1000, 100],
  ]);
});
