import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, getAdminProduct, updateProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { addToCart, buyNowQuote, getCart } from '@/lib/data/cart';
import { getProduct, listProducts } from '@/lib/data/catalog';
import { clipCoupon } from '@/lib/data/coupons';
import { DataError } from '@/lib/data/errors';
import { placeOrder } from '@/lib/data/orders';
import { joinPlus } from '@/lib/data/plus';
import { admin, anon, deleteUser, newUser, US_SHIPPING, type TestUser } from './helpers';

const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? [err.code, err.detail] : [String(err)];
  }
  return ['no error'];
};

const tag = crypto.randomUUID().slice(0, 6);
const input = (over: Partial<ProductInput> = {}): ProductInput => ({
  title: `Memberdeal${tag} desk lamp`,
  brand: 'Lumen',
  category: 'home-kitchen',
  image: '/products/placeholder.jpg',
  priceMinor: 2000,
  listMinor: null,
  deal: false,
  couponPct: null,
  maxPerCustomer: null,
  sizes: null,
  unit: null,
  qtyDiscount: null,
  releaseAt: null,
  badge: null,
  seller: 'Lumen Store',
  shipsFrom: 'Store',
  bullets: [],
  description: null,
  details: [],
  // under the stock the other tests pick products by
  stock: 20,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
  ...over,
});

let boss: TestUser;
let shopper: TestUser;
let member: TestUser;
let id: string;

beforeAll(async () => {
  boss = await newUser('Member Deal Admin');
  shopper = await newUser('Member Deal Shopper');
  member = await newUser('Member Deal Member');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  id = await createProduct(boss.db, 'US', input({ memberPct: 20 }));
  await joinPlus(member.db, 'US', 'annual');
});

afterAll(async () => {
  await deleteUser(shopper);
  await deleteUser(member);
  if (id) await admin().from('products').delete().eq('id', id);
  await deleteUser(boss);
});

describe('Plus exclusive deals', () => {
  it('are set by admins and shown to every shopper', async () => {
    expect((await getAdminProduct(boss.db, id))?.memberPct).toBe(20);
    expect((await getProduct(anon(), id))?.memberPct).toBe(20);
    expect((await listProducts(anon(), 'US', { memberDeals: true, allVariants: true })).map((p) => p.id)).toContain(id);
    // left out of an update, it stays
    await updateProduct(boss.db, id, input({ priceMinor: 2000 }));
    expect((await getProduct(anon(), id))?.memberPct).toBe(20);
  });

  it('refuse a percent out of range, as does the database', async () => {
    expect(await fail(updateProduct(boss.db, id, input({ memberPct: 60 })))).toEqual(['invalid_input', 'memberPct']);
    const { error } = await admin().from('products').update({ member_pct: 0 }).eq('id', id);
    expect(error?.message).toMatch(/products_member_pct_check/);
  });

  it('cost a shopper who isn’t a member the full price', async () => {
    const q = await buyNowQuote(shopper.db, 'US', id, 2);
    expect(q.lines[0].memberMinor).toBeUndefined();
    expect(q.totals.memberMinor).toBeUndefined();
    expect(q.totals.discountMinor ?? 0).toBe(0);

    await addToCart(shopper.db, 'US', id, 1);
    const placed = await placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
    expect(placed.items[0].unitMemberMinor).toBeUndefined();
    expect(placed.totals.memberMinor).toBeUndefined();
  });

  it('take the member price off each unit for a Plus member', async () => {
    const q = await buyNowQuote(member.db, 'US', id, 2);
    expect(q.lines[0]).toMatchObject({ discountMinor: 800, memberMinor: 800, lineTotalMinor: 4000 });
    const t = q.totals;
    expect(t).toMatchObject({ subtotalMinor: 4000, discountMinor: 800, memberMinor: 800 });
    expect(t.totalMinor).toBe(t.subtotalMinor - (t.discountMinor ?? 0) + t.shipMinor + t.taxMinor);
  });

  it('come before a coupon, and are kept on each ordered item', async () => {
    await updateProduct(boss.db, id, input({ couponPct: 10 }));
    await clipCoupon(member.db, id);
    await addToCart(member.db, 'US', id, 2);
    const cart = await getCart(member.db, 'US');
    // $4.00 off as a member, then 10% of the $16.00 left: $1.60
    expect(cart.lines[0]).toMatchObject({ discountMinor: (400 + 160) * 2, memberMinor: 800 });
    expect(cart.totals).toMatchObject({ discountMinor: 1120, memberMinor: 800 });

    const placed = await placeOrder(member.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
    expect(placed.items[0]).toMatchObject({ qty: 2, unitDiscountMinor: 560, unitMemberMinor: 400 });
    expect(placed.totals).toMatchObject({ memberMinor: 800, discountMinor: 1120, totalMinor: cart.totals.totalMinor });
  });
});
