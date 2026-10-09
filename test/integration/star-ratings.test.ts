import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setCartQty } from '@/lib/data/cart';
import { getRatingSummary } from '@/lib/data/catalog';
import { placeOrder } from '@/lib/data/orders';
import { facetCount } from '@/components/product/reviewFilters';
import { awaitingReview, listMyReviews, listReviews, rateProduct, reviewedProductIds, reviewerProfile, reviewFacets, upsertReview } from '@/lib/data/reviews';
import { admin, anon, deleteUser, deliveredDaysAgo, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

describe('star-only ratings', () => {
  let rater: TestUser;
  let productId: string;
  let other: string;
  beforeAll(async () => {
    rater = await newUser('Star Rater');
    [productId, other] = (await Promise.all([pickProduct('US', 93), pickProduct('US', 94)])).map((p) => p.id);
    for (const id of [productId, other]) await setCartQty(rater.db, 'US', id, 1);
    await deliveredDaysAgo((await placeOrder(rater.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING })).id, 2);
  });
  afterAll(async () => {
    await deleteUser(rater);
  });

  it('counts toward the stars but stays out of the written reviews, their facets and the profile', async () => {
    expect((await awaitingReview(rater.db, 'US', rater.id)).map((t) => t.product.id).sort()).toEqual([productId, other].sort());
    const before = await getRatingSummary(anon(), productId);
    const listed = (await listReviews(anon(), productId, null, { limit: 1 })).total;
    const written = facetCount(await reviewFacets(anon(), productId), {});

    const rating = await rateProduct(rater.db, productId, rater.id, 4);
    expect(rating).toMatchObject({ rating: 4, title: '', body: '', mine: true, verified: true, photos: [] });

    const after = await getRatingSummary(anon(), productId);
    expect(after.count).toBe(before.count + 1);
    expect(after.bars.find((b) => b.star === 4)!.count).toBe(before.bars.find((b) => b.star === 4)!.count + 1);
    expect((await listReviews(anon(), productId, null, { limit: 1 })).total).toBe(listed);
    expect(facetCount(await reviewFacets(anon(), productId), {})).toBe(written);

    const own = await listReviews(rater.db, productId, rater.id, { limit: 50 });
    expect(own.mine?.id).toBe(rating.id);
    expect(own.items.map((r) => r.id)).not.toContain(rating.id);
    expect(await reviewerProfile(anon(), 'US', rater.id)).toBeNull();
    expect([...(await reviewedProductIds(rater.db, rater.id, [productId]))]).toEqual([]);
    // rated: no longer waiting, and listed among the shopper's own
    expect((await awaitingReview(rater.db, 'US', rater.id)).map((t) => t.product.id)).toEqual([other]);
    expect((await listMyReviews(rater.db, 'US', rater.id)).map(({ review }) => [review.id, review.body])).toEqual([[rating.id, '']]);
  });

  it('turns into a written review and back; new stars keep what was written', async () => {
    const review = await upsertReview(rater.db, productId, rater.id, { rating: 5, title: 'Won me over', body: 'Better than I expected.' });
    expect((await listReviews(anon(), productId, null, { limit: 50, sort: 'recent' })).items.map((r) => r.id)).toContain(review.id);
    expect([...(await reviewedProductIds(rater.db, rater.id, [productId]))]).toEqual([productId]);

    const restarred = await rateProduct(rater.db, productId, rater.id, 3);
    expect(restarred).toMatchObject({ id: review.id, rating: 3, title: 'Won me over', body: 'Better than I expected.' });

    const back = await upsertReview(rater.db, productId, rater.id, { rating: 2, title: '', body: '' });
    expect(back).toMatchObject({ id: review.id, rating: 2, title: '', body: '' });
    expect((await listReviews(anon(), productId, null, { limit: 50, sort: 'recent' })).items.map((r) => r.id)).not.toContain(review.id);
  });

  it('the database refuses half a review, and photos on a rating', async () => {
    const { data: row } = await admin().from('reviews').select('id').eq('product_id', productId).eq('user_id', rater.id).single();
    const half = await rater.db.from('reviews').update({ title: 'Just a headline' }).eq('id', row!.id);
    expect(half.error?.code).toBe('23514');
    const blank = await rater.db.from('reviews').update({ title: ' ', body: ' ' }).eq('id', row!.id);
    expect(blank.error?.code).toBe('23514');
    // trusted writes skip the photo-ownership trigger, not the constraint
    const photos = await admin().from('reviews').update({ photos: [`${rater.id}/aaaaaaaaaaaaaaaaaaaaaaaa.jpg`] }).eq('id', row!.id);
    expect(photos.error?.code).toBe('23514');
  });
});
