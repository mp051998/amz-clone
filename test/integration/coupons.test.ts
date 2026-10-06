import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deliverOrder } from '@/lib/data/admin-orders';
import { addToCart, getCart, setCartQty } from '@/lib/data/cart';
import { clipCoupon, couponFor, couponPercents, couponUnitSavings, unclipCoupon } from '@/lib/data/coupons';
import { DataError } from '@/lib/data/errors';
import { placeOrder } from '@/lib/data/orders';
import { requestReturn } from '@/lib/data/returns';
import type { Market } from '@/lib/types';
import { admin, anon, deleteUser, newUser, US_SHIPPING, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

/** An in-stock, listed product in the market that has (or, with `coupon: false`, has no) coupon. */
async function product(market: Market, coupon: boolean) {
  const { data: coupons, error: cErr } = await admin().from('coupons').select('product_id, percent_off');
  if (cErr) throw cErr;
  const ids = coupons.map((c) => c.product_id);
  let q = admin().from('products').select('id, price_minor').eq('market_id', market).is('archived_at', null).gte('stock', 25);
  q = coupon ? q.in('id', ids) : q.not('id', 'in', `(${ids.map((id) => `"${id}"`).join(',')})`);
  const { data, error } = await q.order('id').limit(1).single();
  if (error) throw error;
  return { ...data, percentOff: coupons.find((c) => c.product_id === data.id)?.percent_off ?? 0 };
}

describe('coupons', () => {
  let shopper: TestUser;
  let other: TestUser;
  let boss: TestUser;

  beforeAll(async () => {
    [shopper, other, boss] = await Promise.all([newUser('Coupon Shopper'), newUser('Coupon Other'), newUser('Coupon Admin')]);
    const { error } = await admin().from('admins').insert({ user_id: boss.id });
    if (error) throw error;
  });
  afterAll(async () => {
    await Promise.all([deleteUser(shopper), deleteUser(other), deleteUser(boss)]);
  });

  it('every shopper can see coupons; only a signed-in one can apply them', async () => {
    const p = await product('US', true);
    expect(p.percentOff).toBeGreaterThanOrEqual(5);
    expect(await couponFor(anon(), p.id, false)).toEqual({ percentOff: p.percentOff, clipped: false });
    expect((await couponPercents(anon(), [p.id])).get(p.id)).toBe(p.percentOff);
    expect(await code(clipCoupon(anon(), p.id))).toBe('not_authenticated');

    const none = await product('US', false);
    expect(await couponFor(anon(), none.id, false)).toBeNull();
    expect(await code(clipCoupon(shopper.db, none.id))).toBe('coupon_not_found');
  });

  it('coupons and clips only change through the RPCs and admins', async () => {
    const p = await product('US', true);
    const grown = await shopper.db.from('coupons').update({ percent_off: 50 }).eq('product_id', p.id).select();
    expect(grown.error ?? (grown.data?.length === 0 ? 'no rows' : null)).toBeTruthy();
    const added = await shopper.db.from('coupons').insert({ product_id: (await product('US', false)).id, percent_off: 50 });
    expect(added.error).toBeTruthy();
    const clipped = await shopper.db.from('coupon_clips').insert({ user_id: shopper.id, product_id: p.id });
    expect(clipped.error).toBeTruthy();

    const edited = await boss.db.from('coupons').update({ percent_off: p.percentOff }).eq('product_id', p.id).select();
    expect(edited.error).toBeNull();
    expect(edited.data).toHaveLength(1);
  });

  it('an applied coupon comes off each unit in the cart, before delivery and tax', async () => {
    const p = await product('US', true);
    await shopper.db.rpc('cart_clear', { p_market: 'US' });
    await setCartQty(shopper.db, 'US', p.id, 2);
    const before = await getCart(shopper.db, 'US');
    expect(before.lines[0]).toMatchObject({ coupon: { percentOff: p.percentOff, clipped: false }, discountMinor: 0 });
    expect(before.totals.discountMinor).toBe(0);

    expect(await clipCoupon(shopper.db, p.id)).toEqual({ percentOff: p.percentOff, clipped: true });
    expect(await clipCoupon(shopper.db, p.id)).toEqual({ percentOff: p.percentOff, clipped: true });
    expect(await couponFor(shopper.db, p.id, true)).toEqual({ percentOff: p.percentOff, clipped: true });
    // someone else's clip doesn't apply to this shopper
    expect(await couponFor(other.db, p.id, true)).toEqual({ percentOff: p.percentOff, clipped: false });

    const after = await getCart(shopper.db, 'US');
    const off = couponUnitSavings(p.price_minor, p.percentOff) * 2;
    expect(after.lines[0]).toMatchObject({ coupon: { clipped: true }, discountMinor: off, lineTotalMinor: before.lines[0].lineTotalMinor });
    const t = after.totals;
    expect(t).toMatchObject({ subtotalMinor: before.totals.subtotalMinor, discountMinor: off });
    expect(t.taxMinor).toBe(Math.round(((t.subtotalMinor - off) * 8) / 100));
    expect(t.totalMinor).toBe(t.subtotalMinor - off + t.shipMinor + t.taxMinor);

    await unclipCoupon(shopper.db, p.id);
    expect((await getCart(shopper.db, 'US')).totals).toEqual(before.totals);
    await shopper.db.rpc('cart_clear', { p_market: 'US' });
  });

  it('an order keeps what the coupon took off, and a return refunds what was paid', async () => {
    const p = await product('US', true);
    await shopper.db.rpc('cart_clear', { p_market: 'US' });
    await setCartQty(shopper.db, 'US', p.id, 2);
    await clipCoupon(shopper.db, p.id);
    const unitOff = couponUnitSavings(p.price_minor, p.percentOff);

    const order = await placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
    const t = order.totals;
    expect(t.discountMinor).toBe(unitOff * 2);
    expect(t.totalMinor).toBe(t.subtotalMinor - unitOff * 2 + t.shipMinor + t.taxMinor);
    expect(order.items[0]).toMatchObject({ unitPriceMinor: p.price_minor, unitDiscountMinor: unitOff });
    // the coupon stays applied for next time
    expect(await couponFor(shopper.db, p.id, true)).toMatchObject({ clipped: true });

    await deliverOrder(boss.db, order.id);
    const one = await requestReturn(shopper.db, order.id, { items: [{ productId: p.id, qty: 1 }], reason: 'no_longer_needed' });
    expect(one.itemsMinor).toBe(p.price_minor - unitOff);
    const rest = await requestReturn(shopper.db, order.id, { items: [{ productId: p.id, qty: 1 }], reason: 'no_longer_needed' });
    // everything back but delivery: never more than was paid
    expect(one.refundMinor + rest.refundMinor).toBe(t.totalMinor - t.shipMinor);
    await unclipCoupon(shopper.db, p.id);
  });

  it('a guest cart never gets a coupon discount', async () => {
    const p = await product('US', true);
    const guest = crypto.randomUUID();
    await addToCart(anon(), 'US', p.id, 1, guest);
    const cart = await getCart(anon(), 'US', guest);
    expect(cart.lines[0]).toMatchObject({ coupon: { percentOff: p.percentOff, clipped: false }, discountMinor: 0 });
    expect(cart.totals.discountMinor).toBe(0);
  });
});
