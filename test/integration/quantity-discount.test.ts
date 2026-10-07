import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, getAdminProduct, updateProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { addToCart, buyNowQuote, getCart } from '@/lib/data/cart';
import { getProduct } from '@/lib/data/catalog';
import { clipCoupon } from '@/lib/data/coupons';
import { DataError } from '@/lib/data/errors';
import { cancelOrderItems, placeOrder } from '@/lib/data/orders';
import { checkoutQuote } from '@/lib/data/promo';
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
const CODE = `QTY${tag.toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
const input = (over: Partial<ProductInput> = {}): ProductInput => ({
  title: `Qtydiscount${tag} paper towels`,
  brand: 'Roll',
  category: 'home-kitchen',
  image: '/products/placeholder.jpg',
  priceMinor: 2000,
  listMinor: null,
  deal: false,
  couponPct: null,
  maxPerCustomer: null,
  sizes: null,
  unit: null,
  qtyDiscount: { percentOff: 5, minQty: 3 },
  badge: null,
  boughtPastMonth: null,
  seller: 'Roll Store',
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
let id: string;
let plain: string;

beforeAll(async () => {
  boss = await newUser('Qty Discount Admin');
  shopper = await newUser('Qty Discount Shopper');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  id = await createProduct(boss.db, 'US', input());
  plain = await createProduct(boss.db, 'US', input({ title: `Qtydiscount${tag} sponge`, priceMinor: 1000, qtyDiscount: null }));
  // 10% off with no minimum; min-spend 10% off once the towels come to $51.30 after other savings
  const { error: promoError } = await admin().from('promo_codes').insert([
    { market_id: 'US', code: CODE, percent_off: 10, description: '10% off' },
    { market_id: 'US', code: `${CODE}M`, percent_off: 10, min_spend_minor: 5130, description: '10% off $51.30' },
  ], { defaultToNull: false });
  if (promoError) throw promoError;
});

afterAll(async () => {
  await admin().from('promo_codes').update({ ends_at: new Date().toISOString() }).eq('market_id', 'US').in('code', [CODE, `${CODE}M`]);
  await deleteUser(shopper);
  for (const p of [id, plain]) if (p) await admin().from('products').delete().eq('id', p);
  await deleteUser(boss);
});

describe('quantity discounts', () => {
  it('are set by admins, shown to shoppers, and cleared', async () => {
    expect((await getAdminProduct(boss.db, id))?.qtyDiscount).toEqual({ percentOff: 5, minQty: 3 });
    expect((await getProduct(anon(), id))?.qtyDiscount).toEqual({ percentOff: 5, minQty: 3 });
    await updateProduct(boss.db, plain, input({ title: `Qtydiscount${tag} sponge`, priceMinor: 1000, qtyDiscount: { percentOff: 10, minQty: 2 } }));
    expect((await getProduct(anon(), plain))?.qtyDiscount).toEqual({ percentOff: 10, minQty: 2 });
    await updateProduct(boss.db, plain, input({ title: `Qtydiscount${tag} sponge`, priceMinor: 1000, qtyDiscount: null }));
    expect((await getProduct(anon(), plain))?.qtyDiscount).toBeUndefined();
  });

  it('refuses one out of range, and the database refuses half of one', async () => {
    expect(await fail(updateProduct(boss.db, id, input({ qtyDiscount: { percentOff: 60, minQty: 3 } })))).toEqual(['invalid_input', 'qtyDiscount']);
    const { error } = await admin().from('products').update({ qty_discount_pct: 5, qty_discount_min: null }).eq('id', id);
    expect(error?.message).toMatch(/products_qty_discount_check/);
    const { error: low } = await admin().from('products').update({ qty_discount_pct: 5, qty_discount_min: 1 }).eq('id', id);
    expect(low?.message).toMatch(/products_qty_discount_min_check/);
  });

  it('take the percent off each unit once a line reaches the quantity', async () => {
    const two = await buyNowQuote(shopper.db, 'US', id, 2);
    expect(two.lines[0].qtyDiscountMinor).toBeUndefined();
    expect(two.totals.qtyDiscountMinor).toBeUndefined();

    const three = await buyNowQuote(shopper.db, 'US', id, 3);
    expect(three.lines[0]).toMatchObject({ discountMinor: 300, qtyDiscountMinor: 300, lineTotalMinor: 5700 });
    const t = three.totals;
    expect(t).toMatchObject({ subtotalMinor: 6000, discountMinor: 300, qtyDiscountMinor: 300 });
    expect(t.totalMinor).toBe(t.subtotalMinor - (t.discountMinor ?? 0) + t.shipMinor + t.taxMinor);
  });

  it('come after a clipped coupon, in the cart too', async () => {
    await updateProduct(boss.db, id, input({ couponPct: 10 }));
    await clipCoupon(shopper.db, id);
    await addToCart(shopper.db, 'US', id, 3);
    await addToCart(shopper.db, 'US', plain, 1);
    const cart = await getCart(shopper.db, 'US');
    const line = cart.lines.find((l) => l.product.id === id)!;
    // coupon $2.00 a roll, then 5% of the $18.00 left: $0.90
    expect(line).toMatchObject({ discountMinor: (200 + 90) * 3, qtyDiscountMinor: 90 * 3 });
    expect(cart.lines.find((l) => l.product.id === plain)?.qtyDiscountMinor).toBeUndefined();
    expect(cart.totals).toMatchObject({ discountMinor: 870, qtyDiscountMinor: 270 });
  });

  it('count toward a promotion’s minimum spend after they come off, and the promotion goes last', async () => {
    // the towels come to 3 × $17.10 = $51.30 after the coupon and the quantity discount
    const min = await checkoutQuote(shopper.db, 'US', `${CODE}M`, { productId: id, qty: 3 });
    expect(min.promoError).toBeUndefined();
    await updateProduct(boss.db, id, input({ couponPct: 10, qtyDiscount: { percentOff: 6, minQty: 3 } }));
    const short = await checkoutQuote(shopper.db, 'US', `${CODE}M`, { productId: id, qty: 3 });
    expect(short.promoError).toEqual({ code: 'promo_min_spend', detail: '5130' });
    await updateProduct(boss.db, id, input({ couponPct: 10 }));

    // 10% of the $17.10 left: $1.71 a roll
    const q = await checkoutQuote(shopper.db, 'US', CODE, { productId: id, qty: 3 });
    expect(q.cart.lines[0]).toMatchObject({ discountMinor: (200 + 90 + 171) * 3, qtyDiscountMinor: 270, promoMinor: 513 });
    expect(q.cart.totals).toMatchObject({ discountMinor: 1383, qtyDiscountMinor: 270, promoMinor: 513 });
  });

  it('are kept on each ordered item, and a cancelled line refunds what was paid for it', async () => {
    const placed = await placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, promoCode: CODE });
    const towels = placed.items.find((it) => it.productId === id)!;
    expect(towels).toMatchObject({ qty: 3, unitDiscountMinor: 200 + 90 + 171, unitQtyDiscountMinor: 90, unitPromoMinor: 171 });
    expect(placed.items.find((it) => it.productId === plain)?.unitQtyDiscountMinor).toBeUndefined();
    expect(placed.totals).toMatchObject({ qtyDiscountMinor: 270 });
    const t = placed.totals;
    expect(t.totalMinor).toBe(t.subtotalMinor - (t.discountMinor ?? 0) + t.shipMinor + t.taxMinor);

    const after = await cancelOrderItems(shopper.db, placed.id, [id]);
    expect(after.cancellations?.[0]).toMatchObject({ itemsMinor: (2000 - 461) * 3 });
    expect(after.totals.qtyDiscountMinor).toBeUndefined();
  });
});
