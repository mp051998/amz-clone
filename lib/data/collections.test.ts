import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { getSharedList, isShareToken, listChoices, moveItem, shareCollection, unshareCollection } from './collections';

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
