import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reviewerProfile, toggleHelpful, upsertReview } from '@/lib/data/reviews';
import { admin, anon, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

describe('reviewer profiles', () => {
  let writer: TestUser;
  let reader: TestUser;
  let usA: string;
  let usB: string;
  let inProduct: string;
  beforeAll(async () => {
    [writer, reader] = await Promise.all([newUser('Profile Writer'), newUser('Profile Reader')]);
    [usA, usB, inProduct] = (await Promise.all([pickProduct('US', 67), pickProduct('US', 68), pickProduct('IN', 50)])).map((p) => p.id);
  });
  afterAll(async () => {
    await admin().from('reviews').delete().eq('user_id', writer.id);
    await Promise.all([writer, reader].map(deleteUser));
  });

  it('lists a shopper’s visible reviews in one store, newest first, for anyone', async () => {
    const older = await upsertReview(writer.db, usA, writer.id, { rating: 4, title: 'Solid kettle', body: 'Boils fast.', authorName: 'Old Name' });
    await new Promise((r) => setTimeout(r, 20));
    const newer = await upsertReview(writer.db, usB, writer.id, { rating: 2, title: 'Meh mug', body: 'Chipped quickly.', authorName: 'Profile Pat' });
    await upsertReview(writer.db, inProduct, writer.id, { rating: 5, title: 'Great in India', body: 'Lovely.' });
    await toggleHelpful(reader.db, older.id);

    const us = await reviewerProfile(anon(), 'US', writer.id);
    expect(us).toMatchObject({ name: 'Profile Pat', initial: 'P', total: 2, helpful: 1, page: 1, pageCount: 1 });
    expect(us!.reviews.map((r) => [r.review.id, r.product.id])).toEqual([[newer.id, usB], [older.id, usA]]);
    expect(us!.reviews[0].review).toMatchObject({ authorId: writer.id, title: 'Meh mug', mine: false });

    const india = await reviewerProfile(anon(), 'IN', writer.id);
    expect(india!.reviews.map((r) => r.product.id)).toEqual([inProduct]);
  });

  it('leaves out hidden reviews, and is empty once none are visible', async () => {
    const { error } = await admin().from('reviews').update({ hidden_at: new Date().toISOString(), hidden_reason: 'admin' }).eq('user_id', writer.id).eq('product_id', usB);
    if (error) throw error;
    const us = await reviewerProfile(anon(), 'US', writer.id);
    expect(us!.reviews.map((r) => r.product.id)).toEqual([usA]);
    expect(us!.total).toBe(1);

    const again = await admin().from('reviews').update({ hidden_at: new Date().toISOString(), hidden_reason: 'admin' }).eq('user_id', writer.id).eq('product_id', usA);
    if (again.error) throw again.error;
    expect(await reviewerProfile(anon(), 'US', writer.id)).toBeNull();
  });

  it('has no profile for someone without reviews, or for a malformed id', async () => {
    expect(await reviewerProfile(anon(), 'US', reader.id)).toBeNull();
    expect(await reviewerProfile(anon(), 'US', randomUUID())).toBeNull();
    expect(await reviewerProfile(anon(), 'US', 'not-a-uuid')).toBeNull();
  });
});
