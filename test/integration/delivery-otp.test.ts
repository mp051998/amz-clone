import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAddress } from '@/lib/data/addresses';
import { createProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { createCategory } from '@/lib/data/admin-categories';
import { cancelOrder, placeOrder, setOrderAddress } from '@/lib/data/orders';
import { listPickupPoints } from '@/lib/data/pickup';
import { admin, anon, deleteUser, IN_SHIPPING, newUser, type TestUser } from './helpers';

const tag = crypto.randomUUID().slice(0, 6);
let boss: TestUser;
let shopper: TestUser;
// the test's own amazon.in category, with a ₹12,000 product and a ₹500 one
let category = '';
let dear = '';
let cheap = '';

const item = (priceMinor: number): ProductInput => ({
  title: `Delivery OTP test ${tag}`,
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

const buy = (productId: string) => placeOrder(shopper.db, 'IN', { paymentMethod: 'upi', shipping: IN_SHIPPING, buyNow: { productId, qty: 1 } });

beforeAll(async () => {
  [boss, shopper] = await Promise.all([newUser('Delivery OTP Admin'), newUser('Delivery OTP Shopper')]);
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  category = await createCategory(boss.db, { name: `Delivery OTP ${tag}` }, 'IN');
  [dear, cheap] = await Promise.all([createProduct(boss.db, 'IN', item(1_200_000)), createProduct(boss.db, 'IN', item(50_000))]);
});

afterAll(async () => {
  await deleteUser(shopper);
  await admin().from('products').delete().in('id', [dear, cheap].filter(Boolean));
  if (category) {
    await admin().from('market_categories').delete().eq('category_slug', category);
    await admin().from('categories').delete().eq('slug', category);
  }
  await deleteUser(boss);
});

describe('Delivery OTP (high-value home deliveries)', () => {
  it('starts at ₹10,000 on amazon.in and $500 on amazon.com', async () => {
    const { data } = await admin().from('markets').select('id, delivery_otp_min_minor').order('id');
    expect(data).toEqual([
      { id: 'IN', delivery_otp_min_minor: 1_000_000 },
      { id: 'US', delivery_otp_min_minor: 50_000 },
    ]);
  });

  it('gives an order at or over the line a six-digit code, and a cheaper one none', async () => {
    const big = await buy(dear);
    expect(big.deliveryOtp).toMatch(/^[0-9]{6}$/);
    const small = await buy(cheap);
    expect(small.deliveryOtp).toBeUndefined();
    await Promise.all([cancelOrder(shopper.db, big.id), cancelOrder(shopper.db, small.id)]);
  });

  it('a pickup order has its own code instead, until it’s sent to an address', async () => {
    const [point] = await listPickupPoints(anon(), 'IN');
    const o = await placeOrder(shopper.db, 'IN', {
      paymentMethod: 'upi',
      shipping: { fullName: IN_SHIPPING.fullName, phone: IN_SHIPPING.phone },
      pickupPoint: point.id,
      buyNow: { productId: dear, qty: 1 },
    });
    expect(o.pickup?.code).toMatch(/^[0-9]{6}$/);
    expect(o.deliveryOtp).toBeUndefined();

    const home = await createAddress(shopper.db, 'IN', IN_SHIPPING);
    const moved = await setOrderAddress(shopper.db, o.id, home.id);
    expect(moved.pickup).toBeUndefined();
    expect(moved.deliveryOtp).toMatch(/^[0-9]{6}$/);
    await cancelOrder(shopper.db, o.id);
  });

  it('the database only stores six digits', async () => {
    const o = await buy(cheap);
    const { error } = await admin().from('orders').update({ delivery_otp: '12ab56' }).eq('id', o.id);
    expect(error?.message).toMatch(/check constraint/);
    await cancelOrder(shopper.db, o.id);
  });
});
