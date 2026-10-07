import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mostWishedFor } from '@/lib/data/catalog';
import { addItem, createCollection, ensureDefaultCollection, ensureSystemCollection } from '@/lib/data/collections';
import { admin, anon, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

let a: TestUser;
let b: TestUser;
let c: TestUser;
let x: { id: string };
let y: { id: string };
let z: { id: string };
let category: string;

beforeAll(async () => {
  [a, b, c] = await Promise.all([newUser('Wisher A'), newUser('Wisher B'), newUser('Wisher C')]);
  [x, y, z] = await Promise.all([pickProduct('US', 74), pickProduct('US', 75), pickProduct('US', 76)]);
  // y: three shoppers. x: two, one of them with it on two lists. z: only in a cart's "Saved for later"
  const aMain = await ensureDefaultCollection(a.db, 'US');
  const aGifts = await createCollection(a.db, 'US', { name: 'Gift ideas' });
  await addItem(a.db, aMain.id, x.id);
  await addItem(a.db, aGifts.id, x.id);
  await addItem(a.db, aMain.id, y.id);
  const bMain = await ensureDefaultCollection(b.db, 'US');
  await addItem(b.db, bMain.id, x.id);
  await addItem(b.db, bMain.id, y.id);
  const cMain = await ensureDefaultCollection(c.db, 'US');
  await addItem(c.db, cMain.id, y.id);
  const cLater = await ensureSystemCollection(c.db, 'US', 'later');
  await addItem(c.db, cLater.id, z.id);
  const { data } = await admin().from('products').select('category_slug').eq('id', y.id).single();
  category = data!.category_slug;
});

afterAll(async () => {
  await admin().from('products').update({ archived_at: null }).eq('id', y.id);
  await Promise.all([deleteUser(a), deleteUser(b), deleteUser(c)]);
});

describe('most wished for', () => {
  it('ranks by shoppers who saved it lately, each counted once; saved for later isn’t a wish', async () => {
    const { data, error } = await anon().rpc('most_wished_for', { p_market: 'US', p_limit: 100 });
    expect(error).toBeNull();
    const ids = data!;
    expect(ids).toContain(x.id);
    expect(ids.indexOf(y.id)).toBeLessThan(ids.indexOf(x.id));
    expect(ids).not.toContain(z.id);
    // the other store's chart doesn't see these lists
    expect((await anon().rpc('most_wished_for', { p_market: 'IN', p_limit: 100 })).data).not.toContain(x.id);
  });

  it('only products still on sale', async () => {
    await admin().from('products').update({ archived_at: new Date().toISOString() }).eq('id', y.id);
    expect((await anon().rpc('most_wished_for', { p_market: 'US', p_limit: 100 })).data).not.toContain(y.id);
    await admin().from('products').update({ archived_at: null }).eq('id', y.id);
  });

  it('the chart puts wished products first, by department, and fills up with bestsellers', async () => {
    const chart = await mostWishedFor(anon(), 'US', { category, limit: 40 });
    expect(chart[0]?.id).toBe(y.id);
    expect(chart.every((p) => p.category === category)).toBe(true);
    expect(new Set(chart.map((p) => p.id)).size).toBe(chart.length);
    expect(chart.length).toBeGreaterThan(1);
  });
});
