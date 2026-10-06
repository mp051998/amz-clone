import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addItem, createCollection, savedPriceDrops } from '@/lib/data/collections';
import { admin, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

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
    expect(await savedPriceDrops(shopper.db, 'US')).toEqual([]);
    await admin().from('products').update({ price_minor: p.price_minor - 300 }).eq('id', p.id);
    try {
      const drops = await savedPriceDrops(shopper.db, 'US');
      expect(drops.map((d) => [d.product.id, d.savedPriceMinor, d.dropMinor])).toEqual([[p.id, p.price_minor, 300]]);
      expect(await savedPriceDrops(shopper.db, 'IN')).toEqual([]);
      expect(await savedPriceDrops(other.db, 'US')).toEqual([]);
    } finally {
      await admin().from('products').update({ price_minor: p.price_minor }).eq('id', p.id);
    }
  });
});
