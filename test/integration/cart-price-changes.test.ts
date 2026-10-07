import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addToCart, getCart, mergeGuestCart, setCartQty } from '@/lib/data/cart';
import { admin, anon, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

const setPrice = async (id: string, price_minor: number) => {
  const { error } = await admin().from('products').update({ price_minor }).eq('id', id);
  if (error) throw error;
};

/** A lower price (prices only go down here: a product's list price must stay above it). */
const lower = (price: number) => price - Math.ceil(price / 4);

let shopper: TestUser;
let a: { id: string; price_minor: number };
let b: { id: string; price_minor: number };

beforeAll(async () => {
  [shopper, a, b] = await Promise.all([newUser('Cart Price Shopper'), pickProduct('US', 101), pickProduct('US', 102)]);
});

afterAll(async () => {
  await Promise.all([setPrice(a.id, a.price_minor), setPrice(b.id, b.price_minor)]);
  await deleteUser(shopper);
});

const lineOf = async (db: TestUser['db'], id: string, guest?: string) => (await getCart(db, 'US', guest)).lines.find((l) => l.product.id === id);

describe('a cart line remembers the price it was added at', () => {
  it('and keeps it while the price moves, until the line is taken out and put back', async () => {
    await addToCart(shopper.db, 'US', a.id, 1);
    expect(await lineOf(shopper.db, a.id)).toMatchObject({ addedPriceMinor: a.price_minor, product: { priceMinor: a.price_minor } });

    await setPrice(a.id, lower(a.price_minor));
    await addToCart(shopper.db, 'US', a.id, 1);
    expect(await lineOf(shopper.db, a.id)).toMatchObject({ qty: 2, addedPriceMinor: a.price_minor, product: { priceMinor: lower(a.price_minor) } });

    await setCartQty(shopper.db, 'US', a.id, 0);
    await addToCart(shopper.db, 'US', a.id, 1);
    expect((await lineOf(shopper.db, a.id))?.addedPriceMinor).toBe(lower(a.price_minor));
  });

  it('a guest’s line brings its price along when it merges on sign-in', async () => {
    const guest = crypto.randomUUID();
    await addToCart(anon(), 'US', b.id, 1, guest);
    await setPrice(b.id, lower(b.price_minor));
    expect(await mergeGuestCart(shopper.db, guest)).toBe(1);
    expect(await lineOf(shopper.db, b.id)).toMatchObject({ addedPriceMinor: b.price_minor, product: { priceMinor: lower(b.price_minor) } });
  });
});
