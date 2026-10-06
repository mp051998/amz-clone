import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addItem, createCollection, getCollection, listChoices, moveItem } from '@/lib/data/collections';
import { DataError } from '@/lib/data/errors';
import { admin, anon, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('moving items between lists', () => {
  let owner: TestUser;
  let other: TestUser;
  let a: string;
  let b: string;
  let inList: string;
  let p: { id: string; price_minor: number };
  let q: { id: string; price_minor: number };
  beforeAll(async () => {
    [owner, other] = await Promise.all([newUser('Move Owner'), newUser('Move Other')]);
    [p, q] = await Promise.all([pickProduct('US', 26), pickProduct('US', 27)]);
    // one after the other: lists of a kind are ordered oldest first
    a = (await createCollection(owner.db, 'US', { name: 'Kitchen' })).id;
    b = (await createCollection(owner.db, 'US', { name: 'Housewarming' })).id;
    inList = (await createCollection(owner.db, 'IN', { name: 'Diwali' })).id;
  });
  afterAll(async () => {
    await Promise.all([deleteUser(owner), deleteUser(other)]);
  });

  it('keeps the price and date it was saved at', async () => {
    const saved = await addItem(owner.db, a, p.id);
    await admin().from('products').update({ price_minor: p.price_minor + 700 }).eq('id', p.id);
    try {
      await moveItem(owner.db, a, b, p.id);
      const [from, to] = await Promise.all([getCollection(owner.db, a), getCollection(owner.db, b)]);
      expect(from!.items).toEqual([]);
      expect(to!.items).toHaveLength(1);
      expect(to!.items[0]).toMatchObject({ savedPriceMinor: p.price_minor, addedAt: saved.addedAt });
      expect(to!.items[0].product.priceMinor).toBe(p.price_minor + 700);
    } finally {
      await admin().from('products').update({ price_minor: p.price_minor }).eq('id', p.id);
    }
  });

  it('a direct add still gets today’s price', async () => {
    const { error } = await owner.db.from('collection_items').insert({ collection_id: a, product_id: q.id, saved_price_minor: 1 });
    expect(error).toBeNull();
    const { data } = await admin().from('collection_items').select('saved_price_minor').eq('collection_id', a).eq('product_id', q.id).single();
    expect(data!.saved_price_minor).toBe(q.price_minor);
  });

  it('when it’s already on the target, that copy stays', async () => {
    await addItem(owner.db, b, q.id);
    await moveItem(owner.db, a, b, q.id);
    const [from, to] = await Promise.all([getCollection(owner.db, a), getCollection(owner.db, b)]);
    expect(from!.items.map((i) => i.product.id)).toEqual([]);
    expect(to!.items.map((i) => i.product.id).sort()).toEqual([p.id, q.id].sort());
  });

  it('only between the shopper’s own lists in one store, and only what’s there', async () => {
    expect(await code(moveItem(other.db, b, a, p.id))).toBe('collection_not_found');
    expect(await code(moveItem(owner.db, b, inList, p.id))).toBe('collection_not_found');
    expect(await code(moveItem(owner.db, a, b, p.id))).toBe('item_not_found');
    expect((await anon().rpc('move_collection_item', { p_from: b, p_to: a, p_product: p.id })).error).not.toBeNull();
    expect((await getCollection(owner.db, b))!.items).toHaveLength(2);
  });

  it('ticks the lists a product is on', async () => {
    const choices = await listChoices(owner.db, 'US', p.id);
    expect(choices.map((c) => [c.name, c.has])).toEqual([
      ['Kitchen', false],
      ['Housewarming', true],
    ]);
    expect(await listChoices(other.db, 'US', p.id)).toEqual([]);
  });
});
