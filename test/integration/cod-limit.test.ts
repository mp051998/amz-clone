import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { createCategory } from '@/lib/data/admin-categories';
import { getCart, setCartQty } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { cancelOrder, placeOrder } from '@/lib/data/orders';
import { COD_MAX_MINOR } from '@/lib/cod';
import { admin, deleteUser, IN_SHIPPING, newUser, type TestUser } from './helpers';

/** What a call failed with, as its code (or 'no error'). */
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

const tag = crypto.randomUUID().slice(0, 6);
let boss: TestUser;
let shopper: TestUser;
// the test's own amazon.in category and a ₹25,000 product in it
let category = '';
let product = '';

const item = (priceMinor: number): ProductInput => ({
  title: `COD limit test ${tag}`,
  brand: null,
  category,
  image: '/products/placeholder.jpg',
  priceMinor,
  listMinor: null,
  deal: false,
  couponPct: null,
  maxPerCustomer: null,
  sizes: null,
  unit: null,
  qtyDiscount: null,
  releaseAt: null,
  badge: null,
  seller: 'Test Seller',
  shipsFrom: 'Store',
  bullets: [],
  description: null,
  details: [],
  // under pickProduct's 25, so other tests never pick it
  stock: 20,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
});

const buy = (qty: number, paymentMethod: 'cod' | 'upi') =>
  placeOrder(shopper.db, 'IN', { paymentMethod, shipping: IN_SHIPPING, buyNow: { productId: product, qty } });

beforeAll(async () => {
  [boss, shopper] = await Promise.all([newUser('COD Limit Admin'), newUser('COD Limit Shopper')]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  category = await createCategory(boss.db, { name: `COD limit ${tag}` }, 'IN');
  product = await createProduct(boss.db, 'IN', item(2_500_000));
});

afterAll(async () => {
  await deleteUser(shopper);
  if (product) await admin().from('products').delete().eq('id', product);
  if (category) {
    await admin().from('market_categories').delete().eq('category_slug', category);
    await admin().from('categories').delete().eq('slug', category);
  }
  await deleteUser(boss);
});

describe('Pay on Delivery ceiling (amazon.in, ₹50,000)', () => {
  it('matches the store’s ceiling', async () => {
    const { data } = await admin().from('markets').select('id, cod_max_minor').order('id');
    expect(data).toEqual([
      { id: 'IN', cod_max_minor: COD_MAX_MINOR },
      { id: 'US', cod_max_minor: null },
    ]);
  });

  it('takes an order of up to ₹50,000 and refuses one over it, which can be paid another way', async () => {
    const two = await buy(2, 'cod');
    expect(two).toMatchObject({ paymentMethod: 'cod', status: 'placed' });
    expect(two.totals.totalMinor).toBe(COD_MAX_MINOR);
    await cancelOrder(shopper.db, two.id);

    expect(await failure(buy(3, 'cod'))).toBe('cod_unavailable');
    const upi = await buy(3, 'upi');
    expect(upi).toMatchObject({ paymentMethod: 'upi' });
    await cancelOrder(shopper.db, upi.id);
  });

  it('refuses the cart over it and leaves the cart as it was', async () => {
    await shopper.db.rpc('cart_clear', { p_market: 'IN' });
    await setCartQty(shopper.db, 'IN', product, 3);
    expect(await failure(placeOrder(shopper.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING }))).toBe('cod_unavailable');
    const cart = await getCart(shopper.db, 'IN');
    expect(cart.lines.map((l) => [l.product.id, l.qty])).toEqual([[product, 3]]);
    await shopper.db.rpc('cart_clear', { p_market: 'IN' });
  });
});
