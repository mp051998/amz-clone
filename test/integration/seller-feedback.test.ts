import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataError } from '@/lib/data/errors';
import { placeOrder } from '@/lib/data/orders';
import { leaveSellerFeedback, orderFeedback, removeSellerFeedback, sellerRatings } from '@/lib/data/seller-feedback';
import { admin, anon, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, pickProduct, type TestUser } from './helpers';

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
  return 'no error';
};

describe('seller feedback', () => {
  let me: TestUser;
  let other: TestUser;
  beforeAll(async () => {
    [me, other] = await Promise.all([newUser('Feedback Giver'), newUser('Someone Else')]);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(me), deleteUser(other)]);
  });

  /** A cash-on-delivery India order, booked for delivery later (tests move it to delivered). */
  async function placed(u: TestUser, offset: number) {
    const p = await pickProduct('IN', offset);
    return placeOrder(u.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId: p.id, qty: 1 } });
  }

  it('rates a seller once the order arrives, changes it, and only for 90 days', async () => {
    const order = await placed(me, 37);
    const seller = order.items[0].seller;
    expect(await failure(leaveSellerFeedback(me.db, order.id, seller, { rating: 5 }))).toBe('feedback_not_open:');

    await deliveredDaysAgo(order.id, 2);
    const left = await leaveSellerFeedback(me.db, order.id, seller, { rating: 5, arrivedOnTime: true, comment: '  Fast and well packed  ' });
    expect(left).toMatchObject({ orderId: order.id, seller, rating: 5, arrivedOnTime: true, asDescribed: null, comment: 'Fast and well packed' });

    const changed = await leaveSellerFeedback(me.db, order.id, seller, { rating: 2, asDescribed: false });
    expect(changed).toMatchObject({ rating: 2, arrivedOnTime: null, asDescribed: false, comment: null, createdAt: left.createdAt });
    expect([...(await orderFeedback(me.db, order.id)).values()]).toEqual([changed]);

    // only sellers in the order
    expect(await failure(leaveSellerFeedback(me.db, order.id, 'Not A Seller Here', { rating: 4 }))).toBe('invalid_input:seller');
    const raw = await me.db.rpc('leave_seller_feedback', { p_order_id: order.id, p_seller: seller, p_rating: 6 });
    expect(raw.error?.message).toBe('invalid_input');

    await deliveredDaysAgo(order.id, 91);
    expect(await failure(leaveSellerFeedback(me.db, order.id, seller, { rating: 4 }))).toBe('feedback_not_open:');
    // what was left can still be taken back
    await removeSellerFeedback(me.db, order.id, seller);
    expect((await orderFeedback(me.db, order.id)).size).toBe(0);
    expect(await failure(removeSellerFeedback(me.db, order.id, seller))).toBe('not_found:feedback');
  });

  it("is the shopper's own: no one else rates their order or reads their feedback", async () => {
    const order = await placed(me, 38);
    await deliveredDaysAgo(order.id, 1);
    const seller = order.items[0].seller;
    await leaveSellerFeedback(me.db, order.id, seller, { rating: 4 });

    expect(await failure(leaveSellerFeedback(other.db, order.id, seller, { rating: 1 }))).toBe('order_not_found:');
    const peek = await other.db.from('seller_feedback').select('rating').eq('order_id', order.id);
    expect(peek.data).toEqual([]);
    expect(await failure(removeSellerFeedback(other.db, order.id, seller))).toBe('not_found:feedback');
    // writes go through the function, never straight into the table
    const forged = await me.db.from('seller_feedback').insert({ order_id: order.id, seller: 'Someone', market_id: 'IN', rating: 5 });
    expect(forged.error).toBeTruthy();
    const guest = await anon().from('seller_feedback').select('rating');
    expect(guest.error).toBeTruthy();
  });

  it("shows each seller's 12-month rating to everyone", async () => {
    const mine = await placed(me, 39);
    const theirs = await placed(other, 39);
    await Promise.all([deliveredDaysAgo(mine.id, 3), deliveredDaysAgo(theirs.id, 3)]);
    const seller = mine.items[0].seller;
    const before = (await sellerRatings(anon(), 'IN', [seller])).get(seller)?.ratings ?? 0;

    await leaveSellerFeedback(me.db, mine.id, seller, { rating: 5 });
    await leaveSellerFeedback(other.db, theirs.id, seller, { rating: 2 });
    const now = (await sellerRatings(anon(), 'IN', [seller])).get(seller);
    expect(now?.ratings).toBe(before + 2);

    // a rating older than 12 months drops out
    const old = await admin()
      .from('seller_feedback')
      .update({ created_at: new Date(Date.now() - 400 * 86_400_000).toISOString() })
      .eq('order_id', theirs.id);
    if (old.error) throw old.error;
    expect((await sellerRatings(anon(), 'IN', [seller])).get(seller)?.ratings).toBe(before + 1);
    expect((await sellerRatings(anon(), 'IN', ['No Such Seller'])).size).toBe(0);
  });
});
