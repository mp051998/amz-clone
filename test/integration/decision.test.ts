import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addItem,
  createCollection,
  deleteCollection,
  getCollection,
  listCollections,
  removeItem,
  savedProductIds,
  toggleSaved,
  updateCollection,
} from '@/lib/data/collections';
import { getInsight, getInsights } from '@/lib/data/insights';
import { DataError } from '@/lib/data/errors';
import { listCategories } from '@/lib/data/catalog';
import { alternativesFor, accessoriesFor, rankedSearch } from '@/lib/decision/server';
import { parseQuery } from '@/lib/decision/query';
import { summarizeReviews } from '@/lib/ai/features/reviews';
import { createMockProvider } from '@/lib/ai/providers/mock';
import { getProduct } from '@/lib/data/catalog';
import type { Db } from '@/lib/db/client';
import { admin, anon, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

const code = async (p: PromiseLike<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('product insights', () => {
  it('are seeded for every product and publicly readable', async () => {
    const p = await pickProduct('US', 0);
    const ins = await getInsight(anon(), p.id);
    expect(ins).not.toBeNull();
    expect(ins!.source).toBe('rules');
    expect(Object.keys(ins!.scores).length).toBe(5);
    const { count } = await admin().from('product_insights').select('*', { count: 'exact', head: true });
    const { count: products } = await admin().from('products').select('*', { count: 'exact', head: true });
    expect(count).toBe(products);
  });

  it('cannot be written by browser roles', async () => {
    const p = await pickProduct('US', 1);
    const u = await newUser();
    try {
      for (const db of [anon(), u.db]) {
        const ins = await db.from('product_insights').insert({ product_id: p.id, summary: 'x' });
        expect(ins.error).not.toBeNull();
        const up = await db.from('product_insights').update({ summary: 'hacked' }).eq('product_id', p.id).select();
        expect(up.error !== null || (up.data ?? []).length === 0).toBe(true);
      }
      expect((await getInsight(anon(), p.id))!.summary).not.toBe('hacked');
    } finally {
      await deleteUser(u);
    }
  });

  it('ai_cache is service-role only', async () => {
    const u = await newUser();
    try {
      for (const db of [anon(), u.db]) {
        expect((await db.from('ai_cache').select('key')).error).not.toBeNull();
        expect((await db.from('ai_cache').insert({ key: 'k', feature: 'f', provider: 'p', value: {}, expires_at: new Date().toISOString() })).error).not.toBeNull();
      }
      const w = await admin().from('ai_cache').upsert({ key: `t-${crypto.randomUUID()}`, feature: 'test', provider: 'mock', value: { a: 1 }, expires_at: new Date(Date.now() + 60_000).toISOString() });
      expect(w.error).toBeNull();
    } finally {
      await deleteUser(u);
    }
  });
});

describe('collections', () => {
  let a: TestUser;
  let b: TestUser;
  beforeAll(async () => {
    [a, b] = await Promise.all([newUser('Collector A'), newUser('Collector B')]);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(a), deleteUser(b)]);
  });

  it('are invisible to anon and require sign-in to create', async () => {
    expect((await anon().from('collections').select('id')).data ?? []).toEqual([]);
    expect(await code(createCollection(anon(), 'US', { name: 'Nope' }))).not.toBe('no error');
  });

  it('stamp the saved price and keep it on re-add', async () => {
    const p = await pickProduct('US', 2);
    const c = await createCollection(a.db, 'US', { name: 'Desk setup', note: 'for the new office' });
    expect(c.kind).toBe('custom');
    const item = await addItem(a.db, c.id, p.id);
    expect(item.savedPriceMinor).toBe(p.price_minor);
    await admin().from('products').update({ price_minor: p.price_minor + 500 }).eq('id', p.id);
    try {
      const again = await addItem(a.db, c.id, p.id);
      expect(again.savedPriceMinor).toBe(p.price_minor);
      const got = await getCollection(a.db, c.id);
      expect(got!.items).toHaveLength(1);
      expect(got!.items[0].product.priceMinor).toBe(p.price_minor + 500);
    } finally {
      await admin().from('products').update({ price_minor: p.price_minor }).eq('id', p.id);
    }
    // items cannot be edited directly
    const upd = await a.db.from('collection_items').update({ saved_price_minor: 1 }).eq('collection_id', c.id).select();
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    await removeItem(a.db, c.id, p.id);
    expect((await getCollection(a.db, c.id))!.items).toHaveLength(0);
  });

  it('reject products from another store', async () => {
    const inProduct = await pickProduct('IN', 0);
    const c = await createCollection(a.db, 'US', { name: 'Cross store' });
    expect(await code(addItem(a.db, c.id, inProduct.id))).toBe('product_not_found');
  });

  it('are private to their owner', async () => {
    const p = await pickProduct('US', 3);
    const c = await createCollection(a.db, 'US', { name: 'Private list' });
    await addItem(a.db, c.id, p.id);
    expect(await getCollection(b.db, c.id)).toBeNull();
    expect((await listCollections(b.db, 'US')).some((x) => x.id === c.id)).toBe(false);
    expect(await code(updateCollection(b.db, c.id, { name: 'Mine now' }))).toBe('collection_not_found');
    expect(await code(deleteCollection(b.db, c.id))).toBe('collection_not_found');
    expect(await code(addItem(b.db, c.id, p.id))).toBe('collection_not_found');
    const raw = await b.db.from('collection_items').insert({ collection_id: c.id, product_id: p.id, saved_price_minor: 1 });
    expect(raw.error).not.toBeNull();
    await removeItem(b.db, c.id, p.id); // silently affects nothing
    expect((await getCollection(a.db, c.id))!.items).toHaveLength(1);
    // user_id cannot be reassigned
    await a.db.from('collections').update({ user_id: b.id } as never).eq('id', c.id);
    expect(await getCollection(a.db, c.id)).not.toBeNull();
  });

  it('enforce unique names per store (case-insensitive) and allow rename', async () => {
    await createCollection(a.db, 'US', { name: 'Gifts' });
    expect(await code(createCollection(a.db, 'US', { name: '  gifts ' }))).toBe('duplicate');
    const inGifts = await createCollection(a.db, 'IN', { name: 'Gifts' });
    const renamed = await updateCollection(a.db, inGifts.id, { name: 'Diwali gifts', note: 'for family' });
    expect(renamed).toMatchObject({ name: 'Diwali gifts', note: 'for family' });
    expect(await code(createCollection(a.db, 'US', { name: '' }))).toBe('invalid_input');
  });

  it('toggleSaved saves to "Things I\'m Considering" then un-saves everywhere', async () => {
    const p = await pickProduct('US', 4);
    const s1 = await toggleSaved(b.db, 'US', p.id);
    expect(s1).toEqual({ saved: true, collectionName: "Things I'm Considering" });
    expect((await savedProductIds(b.db, 'US')).has(p.id)).toBe(true);
    const lists = await listCollections(b.db, 'US');
    expect(lists[0].kind).toBe('considering');
    const s2 = await toggleSaved(b.db, 'US', p.id);
    expect(s2.saved).toBe(false);
    expect((await savedProductIds(b.db, 'US')).has(p.id)).toBe(false);
  });

  it('cap each shopper at 20 collections', async () => {
    const u = await newUser('Hoarder');
    try {
      for (let i = 0; i < 20; i++) await createCollection(u.db, 'US', { name: `List ${i}` });
      expect(await code(createCollection(u.db, 'US', { name: 'One too many' }))).toBe('collection_limit');
    } finally {
      await deleteUser(u);
    }
  });
});

describe('decision server helpers', () => {
  it('rankedSearch ranks candidates within budget', async () => {
    const db = anon();
    const cats = await listCategories(db, 'US');
    const q = parseQuery('US', 'headphones under $200', cats);
    const res = await rankedSearch('US', q, null, q.budgetMinor, {}, db);
    expect(res.candidates).toBeGreaterThan(0);
    expect(res.items.every((r) => r.product.priceMinor <= 20000)).toBe(true);
    const matches = res.items.map((r) => r.match);
    expect(matches).toEqual([...matches].sort((x, y) => y - x));
  });

  it('alternativesFor and accessoriesFor return same-store suggestions', async () => {
    const db = anon();
    const { id } = await pickProduct('US', 5);
    const product = (await getProduct(db, id))!;
    const alts = await alternativesFor(product, 3, undefined, db);
    expect(alts.length).toBeLessThanOrEqual(3);
    for (const x of alts) {
      expect(x.product.category).toBe(product.category);
      expect(x.product.id).not.toBe(product.id);
      expect(x.diff).toBeTruthy();
    }
    const acc = await accessoriesFor([product], 4, db);
    for (const x of acc) {
      expect(x.product.market).toBe('US');
      expect(x.product.id).not.toBe(product.id);
      expect(x.reason).toMatch(/Goes with your/);
    }
  });
});

describe('AI review summaries', () => {
  it('store an ai insight, keep scores, and fall back on bad replies', async () => {
    const svc = admin() as unknown as Db;
    const { data } = await admin().from('reviews').select('product_id').limit(1);
    const productId = data![0].product_id;
    const before = (await getInsights(svc, [productId])).get(productId)!;
    const provider = createMockProvider([
      'garbage',
      JSON.stringify({
        summary: 'Buyers like the sound and dislike the case.',
        pros: ['Great sound'],
        cons: ['Flimsy case'],
        bestFor: 'Commuters',
        praised: [{ theme: 'Sound', count: 7 }],
        criticized: [{ theme: 'Case', count: 2 }],
      }),
    ]);
    try {
      const bad = await summarizeReviews(productId, { provider, admin: svc, cache: false });
      expect(bad!.source).toBe('rules');
      const good = await summarizeReviews(productId, { provider, admin: svc, cache: false });
      expect(good).toMatchObject({ source: 'ai', summary: 'Buyers like the sound and dislike the case.', cons: ['Flimsy case'] });
      expect(good!.scores).toEqual(before.scores);
      expect(provider.calls[0].prompt).toMatch(/ONLY JSON/);
      // without a provider it is a no-op
      expect((await summarizeReviews(productId, { provider: null, admin: svc }))!.source).toBe('ai');
    } finally {
      await admin().from('product_insights').upsert({
        product_id: productId,
        scores: before.scores,
        pros: before.pros,
        cons: before.cons,
        best_for: before.bestFor,
        summary: before.summary,
        praised: before.praised,
        criticized: before.criticized,
        source: 'rules',
      });
    }
  });
});
