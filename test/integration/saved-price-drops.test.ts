import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addItem, createCollection, listCollections, moveItem, savedUpdates } from '@/lib/data/collections';
import { admin, deleteUser, newUser, pickProduct, setStock, type TestUser } from './helpers';

describe('price drops on saved products', () => {
  let shopper: TestUser;
  let other: TestUser;
  let p: { id: string; price_minor: number };
  beforeAll(async () => {
    [shopper, other] = await Promise.all([newUser('Drop Watcher'), newUser('Drop Other')]);
    p = await pickProduct('US', 28);
    const list = await createCollection(shopper.db, 'US', { name: 'Watching' });
    await addItem(shopper.db, list.id, p.id);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(shopper), deleteUser(other)]);
  });

  it('shows nothing until the price goes below what it was saved at', async () => {
    expect((await savedUpdates(shopper.db, 'US')).drops).toEqual([]);
    await admin().from('products').update({ price_minor: p.price_minor - 300 }).eq('id', p.id);
    try {
      const { drops, back } = await savedUpdates(shopper.db, 'US');
      expect(drops.map((d) => [d.product.id, d.savedPriceMinor, d.dropMinor])).toEqual([[p.id, p.price_minor, 300]]);
      expect(back).toEqual([]);
      expect((await savedUpdates(shopper.db, 'IN')).drops).toEqual([]);
      expect((await savedUpdates(other.db, 'US')).drops).toEqual([]);
    } finally {
      await admin().from('products').update({ price_minor: p.price_minor }).eq('id', p.id);
    }
  });
});

describe('back in stock on saved products', () => {
  let shopper: TestUser;
  let other: TestUser;
  let p: { id: string; price_minor: number; stock: number };
  beforeAll(async () => {
    [shopper, other] = await Promise.all([newUser('Restock Watcher'), newUser('Restock Other')]);
    p = await pickProduct('US', 61);
  });
  afterAll(async () => {
    await admin().from('products').update({ price_minor: p.price_minor, stock: p.stock }).eq('id', p.id);
    await Promise.all([deleteUser(shopper), deleteUser(other)]);
  });

  it('marks a product saved while sold out once it can be bought again', async () => {
    const [list, later] = [await createCollection(shopper.db, 'US', { name: 'Restock' }), await createCollection(shopper.db, 'US', { name: 'Elsewhere' })];
    await setStock(p.id, 0);
    expect((await addItem(shopper.db, list.id, p.id)).savedInStock).toBe(false);
    // still sold out: nothing to say yet
    expect((await savedUpdates(shopper.db, 'US')).back).toEqual([]);

    // back, and cheaper too: it shows once, as back in stock, with the price it was saved at
    await admin().from('products').update({ stock: p.stock, price_minor: p.price_minor - 200 }).eq('id', p.id);
    const now = await savedUpdates(shopper.db, 'US');
    expect(now.back.map((b) => [b.product.id, b.savedPriceMinor])).toEqual([[p.id, p.price_minor]]);
    expect(now.drops.map((d) => d.product.id)).not.toContain(p.id);
    expect((await savedUpdates(other.db, 'US')).back).toEqual([]);
    expect((await savedUpdates(shopper.db, 'IN')).back).toEqual([]);

    // re-adding and moving lists keep how it was saved
    expect((await addItem(shopper.db, list.id, p.id)).savedInStock).toBe(false);
    await moveItem(shopper.db, list.id, later.id, p.id);
    const moved = (await listCollections(shopper.db, 'US')).find((c) => c.id === later.id)!;
    expect(moved.items.map((i) => [i.product.id, i.savedInStock])).toEqual([[p.id, false]]);

    // the shopper can't set it themselves
    const update = await shopper.db.from('collection_items').update({ saved_in_stock: true }).eq('collection_id', later.id).select('saved_in_stock');
    expect(update.data ?? []).toEqual([]);
    const forged = await shopper.db
      .from('collection_items')
      .insert({ collection_id: list.id, product_id: p.id, saved_price_minor: 1, saved_in_stock: false })
      .select('saved_in_stock, saved_price_minor')
      .single();
    expect(forged.data).toEqual({ saved_in_stock: true, saved_price_minor: p.price_minor - 200 });

    // saved again while in stock: the shopper has seen it back, so it isn't news any more
    expect((await savedUpdates(shopper.db, 'US')).back).toEqual([]);
  });
});
