import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listReviews, reviewFitCounts, upsertReview } from '@/lib/data/reviews';
import { fitSummary } from '@/lib/review-fit';
import { admin, anon, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

describe('how it fits, on reviews', () => {
  let shoppers: TestUser[];
  let productId: string;
  const review = { rating: 4, title: 'Fits', body: 'How it fits.' };

  beforeAll(async () => {
    shoppers = await Promise.all(['Fit One', 'Fit Two', 'Fit Three', 'Fit Four'].map((n) => newUser(n)));
    // IN offset 104 is this file's
    productId = (await pickProduct('IN', 104)).id;
  });
  afterAll(async () => {
    await admin().from('reviews').delete().eq('product_id', productId).in('user_id', shoppers.map((u) => u.id));
    await Promise.all(shoppers.map(deleteUser));
  });

  it('is saved with the review and summed over the visible ones', async () => {
    const [one, two, three, four] = shoppers;
    expect((await upsertReview(one.db, productId, one.id, { ...review, authorName: 'Fit One', fit: 'small' })).fit).toBe('small');
    await upsertReview(two.db, productId, two.id, { ...review, authorName: 'Fit Two', fit: 'true_to_size' });
    await upsertReview(three.db, productId, three.id, { ...review, authorName: 'Fit Three', fit: 'true_to_size' });
    expect((await upsertReview(four.db, productId, four.id, { ...review, authorName: 'Fit Four' })).fit).toBeUndefined();

    const counts = await reviewFitCounts(anon(), productId);
    expect(counts).toEqual({ small: 1, true_to_size: 2, large: 0 });
    expect(fitSummary(counts)?.verdict).toBe('true_to_size');
    const { items } = await listReviews(anon(), productId, null, { limit: 10, sort: 'recent' });
    expect(Object.fromEntries(items.filter((r) => r.title === 'Fits').map((r) => [r.author, r.fit ?? null]))).toEqual({
      'Fit One': 'small', 'Fit Two': 'true_to_size', 'Fit Three': 'true_to_size', 'Fit Four': null,
    });

    // a hidden review's answer stops counting
    const { error } = await admin().from('reviews').update({ hidden_at: new Date().toISOString(), hidden_reason: 'admin' }).eq('product_id', productId).eq('user_id', three.id);
    if (error) throw error;
    expect(await reviewFitCounts(anon(), productId)).toEqual({ small: 1, true_to_size: 1, large: 0 });
  });

  it('is kept on a rewrite that leaves it out, cleared with null, and only one of the three answers', async () => {
    const [one] = shoppers;
    expect((await upsertReview(one.db, productId, one.id, { ...review, title: 'Still fits' })).fit).toBe('small');
    expect((await upsertReview(one.db, productId, one.id, { ...review, fit: null })).fit).toBeUndefined();
    const { error } = await one.db.from('reviews').update({ fit: 'tiny' }).eq('product_id', productId).eq('user_id', one.id);
    expect(error?.code).toBe('23514');
  });
});
