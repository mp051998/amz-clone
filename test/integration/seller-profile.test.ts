import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { placeOrder } from '@/lib/data/orders';
import { leaveSellerFeedback, sellerProfile, type SellerProfile } from '@/lib/data/seller-feedback';
import { admin, anon, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, pickProduct, type TestUser } from './helpers';

const DAY_MS = 86_400_000;

describe('seller profile', () => {
  let me: TestUser;
  let other: TestUser;
  beforeAll(async () => {
    [me, other] = await Promise.all([newUser('Profile Rater'), newUser('Another Rater')]);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(me), deleteUser(other)]);
  });

  async function delivered(u: TestUser, offset: number) {
    const p = await pickProduct('IN', offset);
    const order = await placeOrder(u.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId: p.id, qty: 1 } });
    await deliveredDaysAgo(order.id, 2);
    return order;
  }

  const count = (p: SellerProfile | null, period: string) => p?.periods.find((x) => x.period === period);

  it("counts ratings by period and shows comments, but not who left them", async () => {
    const [mine, theirs] = await Promise.all([delivered(me, 40), delivered(other, 40)]);
    const seller = mine.items[0].seller;
    const before = await sellerProfile(anon(), 'IN', seller);
    expect(before?.periods.map((p) => p.period)).toEqual(['30d', '90d', '12m', 'all']);

    const comment = `Packed with care ${mine.id}`;
    await leaveSellerFeedback(me.db, mine.id, seller, { rating: 5, arrivedOnTime: true, comment });
    await leaveSellerFeedback(other.db, theirs.id, seller, { rating: 2, asDescribed: false });
    // the other rating was left 200 days ago: in 12 months and lifetime, not the last 90 days
    const aged = await admin()
      .from('seller_feedback')
      .update({ created_at: new Date(Date.now() - 200 * DAY_MS).toISOString() })
      .eq('order_id', theirs.id);
    if (aged.error) throw aged.error;

    const after = await sellerProfile(anon(), 'IN', seller);
    const delta = (period: string, key: 'ratings' | 'positive' | 'neutral' | 'negative') =>
      (count(after, period)?.[key] ?? 0) - (count(before, period)?.[key] ?? 0);
    expect([delta('30d', 'ratings'), delta('30d', 'positive'), delta('30d', 'negative')]).toEqual([1, 1, 0]);
    expect([delta('90d', 'ratings'), delta('90d', 'negative')]).toEqual([1, 0]);
    expect([delta('12m', 'ratings'), delta('12m', 'positive'), delta('12m', 'neutral'), delta('12m', 'negative')]).toEqual([2, 1, 0, 1]);
    expect(delta('all', 'ratings')).toBe(2);
    expect(after!.stars[5] - before!.stars[5]).toBe(1);
    expect(after!.stars[2] - before!.stars[2]).toBe(1);

    const said = after!.recent.find((r) => r.comment === comment);
    expect(said).toMatchObject({ rating: 5, arrivedOnTime: true, asDescribed: null });
    expect(Object.keys(said!).sort()).toEqual(['arrivedOnTime', 'asDescribed', 'comment', 'createdAt', 'rating']);
    // only ratings with a comment are quoted
    expect(after!.recent.every((r) => r.comment)).toBe(true);
  });

  it("is there for a seller with products but no ratings, and null for one the store doesn't know", async () => {
    const listed = await admin().from('catalog_products').select('seller').eq('market_id', 'US').not('seller', 'is', null).limit(1).single();
    if (listed.error) throw listed.error;
    const seller = listed.data.seller!;
    const profile = await sellerProfile(anon(), 'US', seller);
    expect(profile?.seller).toBe(seller);
    expect(profile?.periods).toHaveLength(4);
    expect(Object.keys(profile!.stars)).toEqual(['1', '2', '3', '4', '5']);

    expect(await sellerProfile(anon(), 'IN', `No Such Seller ${Date.now()}`)).toBeNull();
  });
});
