import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { alsoViewed, recordView } from '@/lib/data/also-viewed';
import { getProduct } from '@/lib/data/catalog';
import type { Product } from '@/lib/types';
import { admin, anon, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

let shopper: TestUser;
let a: Product, b: Product, c: Product, d: Product;

const ids = async (p: Product) => (await alsoViewed(anon(), p)).map((x) => x.id);

beforeAll(async () => {
  // US offsets 113–120 and IN offset 102 are this file's; four products of different variant groups
  const picked: Product[] = [];
  for (let off = 113; off <= 120 && picked.length < 4; off++) {
    const p = (await getProduct(anon(), (await pickProduct('US', off)).id))!;
    if (!p.variant || !picked.some((x) => x.variant?.group === p.variant!.group)) picked.push(p);
  }
  [a, b, c, d] = picked;
  shopper = await newUser('Viewing Shopper');
});

afterAll(async () => {
  await admin().from('products').update({ archived_at: null }).eq('id', d.id);
  await deleteUser(shopper);
});

describe('customers who viewed this also viewed', () => {
  it('pairs a view with the products looked at just before it, both ways, most views first', async () => {
    expect(await ids(a)).toEqual([]);
    // signed out or in, the same count
    await recordView(anon(), a.id, [b.id, c.id]);
    await recordView(shopper.db, c.id, [a.id]);
    expect(await ids(a)).toEqual([c.id, b.id]);
    expect(await ids(b)).toEqual([a.id]);
    expect(await ids(c)).toEqual([a.id]);
  });

  it('leaves out other stores’ products, unknown ids and archived products', async () => {
    const other = await pickProduct('IN', 102);
    await recordView(anon(), b.id, [other.id, 'no-such-product']);
    await recordView(anon(), 'no-such-product', [b.id]);
    expect(await ids(b)).toEqual([a.id]);
    expect(await alsoViewed(anon(), (await getProduct(anon(), other.id))!)).toEqual([]);

    await recordView(anon(), d.id, [b.id]);
    expect(await ids(b)).toContain(d.id);
    const { error } = await admin().from('products').update({ archived_at: new Date().toISOString() }).eq('id', d.id);
    if (error) throw error;
    expect(await ids(b)).not.toContain(d.id);
  });

  it('can’t be read or written directly', async () => {
    const read = await anon().from('product_coviews' as never).select('*');
    expect(read.data ?? []).toEqual([]);
    const write = await anon().from('product_coviews' as never).insert({ product_id: a.id, other_id: b.id, views: 1000 } as never);
    expect(write.error).not.toBeNull();
  });
});
