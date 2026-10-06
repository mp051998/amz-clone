import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setCartQty } from '@/lib/data/cart';
import { placeOrder } from '@/lib/data/orders';
import { awaitingReview, listMyReviews, reviewedProductIds, upsertReview } from '@/lib/data/reviews';
import type { Market, PaymentMethod } from '@/lib/types';
import { admin, deleteUser, IN_SHIPPING, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('your reviews', () => {
  let shopper: TestUser;
  let other: TestUser;
  let a: string;
  let b: string;
  let c: string;
  let inProduct: string;

  async function order(market: Market, method: PaymentMethod, ids: string[]): Promise<string> {
    await shopper.db.rpc('cart_clear', { p_market: market });
    for (const id of ids) await setCartQty(shopper.db, market, id, 1);
    return (await placeOrder(shopper.db, market, { paymentMethod: method, shipping: market === 'IN' ? IN_SHIPPING : US_SHIPPING })).id;
  }

  /** Delivered `daysAgo` days ago (service role, as time passing would). */
  async function deliveredDaysAgo(id: string, daysAgo: number) {
    const at = Date.now() - daysAgo * DAY;
    const { error } = await admin()
      .from('orders')
      .update({ placed_at: iso(at - 3 * DAY), shipped_at: iso(at - 2 * DAY), out_for_delivery_at: iso(at - 60_000), delivered_at: iso(at) })
      .eq('id', id);
    if (error) throw error;
  }

  beforeAll(async () => {
    [shopper, other] = await Promise.all([newUser('Review Hub Shopper'), newUser('Review Hub Other')]);
    [a, b, c, inProduct] = (await Promise.all([pickProduct('US', 38), pickProduct('US', 39), pickProduct('US', 40), pickProduct('IN', 6)])).map((p) => p.id);
    await deliveredDaysAgo(await order('US', 'giftcard', [a, b]), 2);
    // booked at placement, so not here yet
    await order('US', 'giftcard', [c]);
    await deliveredDaysAgo(await order('IN', 'cod', [inProduct]), 1);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(shopper), deleteUser(other)]);
  });

  it('waits on what has arrived and isn’t reviewed, per store', async () => {
    const us = await awaitingReview(shopper.db, 'US', shopper.id);
    expect(us.map((t) => t.product.id).sort()).toEqual([a, b].sort());
    expect(us.every((t) => Date.parse(t.deliveredAt) < Date.now())).toBe(true);
    expect((await awaitingReview(shopper.db, 'IN', shopper.id)).map((t) => t.product.id)).toEqual([inProduct]);
    expect(await awaitingReview(other.db, 'US', other.id)).toEqual([]);
    expect(await listMyReviews(shopper.db, 'US', shopper.id)).toEqual([]);
  });

  it('a review moves it from waiting to written, hidden ones included', async () => {
    await upsertReview(shopper.db, a, shopper.id, { rating: 5, title: 'Great', body: 'Works as described.' });
    expect((await awaitingReview(shopper.db, 'US', shopper.id)).map((t) => t.product.id)).toEqual([b]);
    expect(await reviewedProductIds(shopper.db, shopper.id, [a, b, c])).toEqual(new Set([a]));
    expect(await reviewedProductIds(other.db, other.id, [a, b, c])).toEqual(new Set());

    const { error } = await admin().from('reviews').update({ hidden_at: new Date().toISOString(), hidden_reason: 'admin' }).eq('product_id', a).eq('user_id', shopper.id);
    expect(error).toBeNull();
    const mine = await listMyReviews(shopper.db, 'US', shopper.id);
    expect(mine.map((m) => [m.product.id, m.review.title, m.review.verified, m.review.hidden, m.review.mine])).toEqual([[a, 'Great', true, true, true]]);
    expect(await listMyReviews(shopper.db, 'IN', shopper.id)).toEqual([]);
  });
});
