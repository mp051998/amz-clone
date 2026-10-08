import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listReviews, reviewerProfile, upsertReview } from '@/lib/data/reviews';
import { admin, anon, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

describe('Vine reviews', () => {
  let shopper: TestUser;
  let productId: string;
  const review = { rating: 5, title: 'Got it free', body: 'An honest take on it.' };

  beforeAll(async () => {
    shopper = await newUser('Vine Shopper');
    // US offset 88 is this file's
    productId = (await pickProduct('US', 88)).id;
  });
  afterAll(async () => {
    await admin().from('reviews').delete().eq('product_id', productId).eq('user_id', shopper.id);
    await deleteUser(shopper);
  });

  it('marks a few seeded reviews in each store, none of them verified purchases', async () => {
    const { data, error } = await admin().from('reviews').select('product_id, verified, products!inner(market_id)').eq('seeded', true).eq('vine', true);
    if (error) throw error;
    expect(new Set(data.map((r) => r.products.market_id))).toEqual(new Set(['US', 'IN']));
    expect(data.every((r) => !r.verified)).toBe(true);

    const id = data[0].product_id;
    const all = await listReviews(anon(), id, null, { limit: 50 });
    expect(all.items.some((r) => r.vine && !r.verified)).toBe(true);
    expect(all.items.filter((r) => !r.vine).every((r) => !('vine' in r))).toBe(true);
    const verified = await listReviews(anon(), id, null, { limit: 50, filter: { verified: true } });
    expect(verified.items.some((r) => r.vine)).toBe(false);
  });

  it('a shopper can’t mark their own review Vine, or unmark one the store marked', async () => {
    const mine = await upsertReview(shopper.db, productId, shopper.id, review);
    expect(mine.vine).toBeUndefined();
    let { error } = await shopper.db.from('reviews').update({ vine: true }).eq('id', mine.id);
    if (error) throw error;
    const read = async () => (await admin().from('reviews').select('vine, verified').eq('id', mine.id).single()).data!;
    expect((await read()).vine).toBe(false);

    // the store marks it (and it stops being a verified purchase, even if it were one)
    ({ error } = await admin().from('reviews').update({ vine: true, verified: true }).eq('id', mine.id));
    if (error) throw error;
    expect(await read()).toEqual({ vine: true, verified: false });

    // a rewrite keeps the mark, and the shopper can't clear it
    expect((await upsertReview(shopper.db, productId, shopper.id, { ...review, title: 'Still free' })).vine).toBe(true);
    ({ error } = await shopper.db.from('reviews').update({ vine: false, verified: true }).eq('id', mine.id));
    if (error) throw error;
    expect(await read()).toEqual({ vine: true, verified: false });

    // shoppers see it marked, and the reviewer is a Vine Voice
    const { items } = await listReviews(anon(), productId, null, { limit: 50, sort: 'recent' });
    expect(items.find((r) => r.id === mine.id)).toMatchObject({ vine: true, verified: false, title: 'Still free' });
    expect((await reviewerProfile(anon(), 'US', shopper.id))?.vine).toBe(true);
  });
});
