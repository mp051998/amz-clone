import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listReviewQueue, moderateReview } from '@/lib/data/admin-reviews';
import { customerImages, uploadReviewPhoto } from '@/lib/data/review-photos';
import { deleteReview, listReviews, upsertReview } from '@/lib/data/reviews';
import { REVIEW_PHOTO_BUCKET } from '@/lib/review-photos';
import { admin, anon, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

// a 1×1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const png = (name = 'photo.png') => new File([PNG], name, { type: 'image/png' });

const filesOf = async (userId: string) =>
  ((await admin().storage.from(REVIEW_PHOTO_BUCKET).list(userId)).data ?? []).map((f) => `${userId}/${f.name}`).sort();

describe('photos on reviews', () => {
  let shopper: TestUser;
  let other: TestUser;
  let agent: TestUser;
  let productId: string;
  beforeAll(async () => {
    [shopper, other, agent] = await Promise.all([newUser('Photo Reviewer'), newUser('Photo Other'), newUser('Photo Agent')]);
    const { error } = await admin().from('admins').insert({ user_id: agent.id });
    if (error) throw error;
    productId = (await pickProduct('US', 62)).id;
  });
  afterAll(async () => {
    await admin().from('reviews').delete().eq('product_id', productId).in('user_id', [shopper.id, other.id]);
    for (const u of [shopper, other]) {
      const left = await filesOf(u.id);
      if (left.length) await admin().storage.from(REVIEW_PHOTO_BUCKET).remove(left);
    }
    await admin().from('admins').delete().eq('user_id', agent.id);
    await Promise.all([shopper, other, agent].map(deleteUser));
  });

  it('shows the photos a shopper adds, on their review and in the product’s customer images', async () => {
    const [a, b] = [await uploadReviewPhoto(shopper.db, shopper.id, png()), await uploadReviewPhoto(shopper.db, shopper.id, png())];
    expect(a.path).toMatch(new RegExp(`^${shopper.id}/[0-9a-f]{24}\\.png$`));
    expect((await fetch(a.url)).status).toBe(200);

    const review = await upsertReview(shopper.db, productId, shopper.id, { rating: 5, title: 'Looks great', body: 'As pictured.', photos: [b.path, a.path] });
    expect(review.photos).toEqual([b, a]);
    const page = await listReviews(anon(), productId, null, { limit: 50 });
    expect(page.items.find((r) => r.id === review.id)?.photos).toEqual([b, a]);
    expect((await customerImages(anon(), productId)).filter((i) => i.reviewId === review.id).map((i) => i.path)).toEqual([b.path, a.path]);

    // rewriting the review without photos keeps them; taking one off deletes its file
    await upsertReview(shopper.db, productId, shopper.id, { rating: 4, title: 'Looks great', body: 'As pictured, mostly.' });
    expect((await listReviews(shopper.db, productId, shopper.id)).mine?.photos).toEqual([b, a]);
    await upsertReview(shopper.db, productId, shopper.id, { rating: 4, title: 'Looks great', body: 'As pictured, mostly.', photos: [a.path] });
    expect(await filesOf(shopper.id)).toEqual([a.path]);

    // hidden reviews' photos leave customer images
    await moderateReview(agent.db, review.id, 'hide');
    expect((await customerImages(anon(), productId)).some((i) => i.reviewId === review.id)).toBe(false);
    await moderateReview(agent.db, review.id, 'keep');
    expect((await customerImages(anon(), productId)).some((i) => i.reviewId === review.id)).toBe(true);

    // deleting the review deletes its photos
    await deleteReview(shopper.db, review.id);
    expect(await filesOf(shopper.id)).toEqual([]);
  });

  it('a review can only show its writer’s own uploaded photos', async () => {
    const mine = await uploadReviewPhoto(shopper.db, shopper.id, png());
    const write = (u: TestUser, photos: string[]) =>
      u.db.from('reviews').insert({ product_id: productId, rating: 3, title: 'Fine', body: 'Fine.', author_name: ' ', photos }).select('id');

    // someone else's photo, a file that isn't there, or the same one twice
    expect((await write(other, [mine.path])).error?.message).toBe('invalid_input');
    expect((await write(shopper, [`${shopper.id}/${'0'.repeat(24)}.png`])).error?.message).toBe('invalid_input');
    expect((await write(shopper, [mine.path, mine.path])).error?.message).toBe('invalid_input');

    // nor can anyone write into another shopper's folder, or upload signed out
    const into = await other.db.storage.from(REVIEW_PHOTO_BUCKET).upload(`${shopper.id}/${'a'.repeat(24)}.png`, PNG, { contentType: 'image/png' });
    expect(into.error).not.toBeNull();
    const signedOut = await anon().storage.from(REVIEW_PHOTO_BUCKET).upload(`${shopper.id}/${'b'.repeat(24)}.png`, PNG, { contentType: 'image/png' });
    expect(signedOut.error).not.toBeNull();
    const wipe = await other.db.storage.from(REVIEW_PHOTO_BUCKET).remove([mine.path]);
    expect(wipe.data ?? []).toEqual([]);
    expect(await filesOf(shopper.id)).toEqual([mine.path]);

    // only images
    const text = await shopper.db.storage.from(REVIEW_PHOTO_BUCKET).upload(`${shopper.id}/${'c'.repeat(24)}.png`, Buffer.from('hi'), { contentType: 'text/plain' });
    expect(text.error).not.toBeNull();
  });

  it('admins see the photos in the queue, and deleting the review clears them', async () => {
    const photo = await uploadReviewPhoto(other.db, other.id, png());
    const review = await upsertReview(other.db, productId, other.id, { rating: 1, title: 'Broken', body: 'Arrived cracked.', photos: [photo.path] });
    await moderateReview(agent.db, review.id, 'hide');
    const queue = await listReviewQueue(agent.db, 'US', { view: 'hidden' });
    expect(queue.reviews.find((r) => r.id === review.id)?.photos).toEqual([photo]);
    await moderateReview(agent.db, review.id, 'delete');
    expect(await filesOf(other.id)).toEqual([]);
  });
});
