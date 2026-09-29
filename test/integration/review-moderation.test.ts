import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getRatingSummary } from '@/lib/data/catalog';
import { assertStoreReview, listReviewQueue, moderateReview } from '@/lib/data/admin-reviews';
import { listReviews, reportReview, upsertReview } from '@/lib/data/reviews';
import { DataError } from '@/lib/data/errors';
import { admin, anon, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

const visibleTo = async (db: Parameters<typeof listReviews>[0], productId: string, id: string) =>
  (await listReviews(db, productId, null, { limit: 50 })).items.some((r) => r.id === id);

describe('review moderation', () => {
  let author: TestUser;
  let boss: TestUser;
  let reporters: TestUser[];
  let productId: string;
  let reviewId: string;
  beforeAll(async () => {
    [author, boss, ...reporters] = await Promise.all([
      newUser('Loud Author'),
      newUser('Review Boss'),
      ...Array.from({ length: 6 }, (_, i) => newUser(`Reporter ${i + 1}`)),
    ]);
    const { error } = await admin().from('admins').insert({ user_id: boss.id });
    if (error) throw error;
    productId = (await pickProduct('US', 14)).id;
    reviewId = (await upsertReview(author.db, productId, author.id, { rating: 1, title: 'Total junk', body: 'Buy anything else.' })).id;
  });
  afterAll(async () => {
    await admin().from('reviews').delete().eq('id', reviewId);
    await Promise.all([author, boss, ...reporters].map(deleteUser));
  });

  const summary = () => getRatingSummary(anon(), productId);

  it('stays up after two reports and comes down on the third', async () => {
    const before = await summary();
    await reportReview(reporters[0].db, reviewId, 'spam');
    await reportReview(reporters[1].db, reviewId, 'offensive');
    await reportReview(reporters[1].db, reviewId, 'spam'); // same shopper again: still one report
    expect(await visibleTo(anon(), productId, reviewId)).toBe(true);

    await reportReview(reporters[2].db, reviewId, 'spam');
    expect(await visibleTo(anon(), productId, reviewId)).toBe(false);
    const after = await summary();
    expect(after.count).toBe(before.count - 1);
  });

  it('shows the hidden review only to its author (marked) and to admins in the queue', async () => {
    const shopper = reporters[3];
    expect((await shopper.db.from('reviews').select('id').eq('id', reviewId)).data).toEqual([]);
    const mine = await listReviews(author.db, productId, author.id);
    expect(mine.mine).toMatchObject({ id: reviewId, hidden: true });
    expect(mine.items[0]).toMatchObject({ id: reviewId, hidden: true });

    const queue = await listReviewQueue(boss.db, 'US');
    const row = queue.reviews.find((r) => r.id === reviewId);
    expect(row).toMatchObject({ hiddenReason: 'reports', openReports: 3, reasons: { spam: 2, offensive: 1 }, productId });
    expect(queue.counts.reported).toBeGreaterThanOrEqual(1);
    expect((await listReviewQueue(boss.db, 'US', { view: 'hidden' })).reviews.some((r) => r.id === reviewId)).toBe(true);
    // the other store's queue doesn't have it
    expect((await listReviewQueue(boss.db, 'IN', { view: 'hidden' })).reviews.some((r) => r.id === reviewId)).toBe(false);
    expect(await code(assertStoreReview(boss.db, 'IN', reviewId))).toBe('review_not_found');
  });

  it('customers cannot unhide their own review, and editing keeps it hidden', async () => {
    await author.db.from('reviews').update({ hidden_at: null, hidden_reason: null, moderated_at: new Date().toISOString() }).eq('id', reviewId);
    await upsertReview(author.db, productId, author.id, { rating: 2, title: 'Still junk', body: 'Buy anything else, really.' });
    const { data } = await admin().from('reviews').select('hidden_at, hidden_reason, moderated_at').eq('id', reviewId).single();
    expect(data).toMatchObject({ hidden_reason: 'reports', moderated_at: null });
    expect(data?.hidden_at).not.toBeNull();
  });

  it('keep puts it back, resolves the reports, and needs three new reporters to hide it again', async () => {
    const hiddenCount = (await summary()).count;
    const kept = await moderateReview(boss.db, reviewId, 'keep');
    expect(kept).toMatchObject({ id: reviewId, deleted: false, hiddenAt: undefined });
    expect(await visibleTo(anon(), productId, reviewId)).toBe(true);
    expect((await summary()).count).toBe(hiddenCount + 1);
    expect((await listReviewQueue(boss.db, 'US')).reviews.some((r) => r.id === reviewId)).toBe(false);

    await reportReview(reporters[3].db, reviewId, 'other');
    await reportReview(reporters[4].db, reviewId, 'other');
    expect(await visibleTo(anon(), productId, reviewId)).toBe(true);
    const row = (await listReviewQueue(boss.db, 'US')).reviews.find((r) => r.id === reviewId);
    expect(row).toMatchObject({ openReports: 2, reasons: { other: 2 } });
    await reportReview(reporters[5].db, reviewId, 'off_topic');
    expect(await visibleTo(anon(), productId, reviewId)).toBe(false);
  });

  it('hide is an admin decision that sticks until kept', async () => {
    await moderateReview(boss.db, reviewId, 'keep');
    const hidden = await moderateReview(boss.db, reviewId, 'hide');
    expect(hidden).toMatchObject({ hiddenReason: 'admin' });
    expect(await visibleTo(anon(), productId, reviewId)).toBe(false);
    const again = await moderateReview(boss.db, reviewId, 'hide');
    expect(again.hiddenAt).toBe(hidden.hiddenAt);
    expect((await listReviewQueue(boss.db, 'US', { view: 'hidden' })).reviews.find((r) => r.id === reviewId)).toMatchObject({ hiddenReason: 'admin', openReports: 0 });
  });

  it('only admins see the queue and moderate', async () => {
    expect(await code(listReviewQueue(author.db, 'US'))).toBe('forbidden');
    expect(await code(listReviewQueue(anon(), 'US'))).toBe('forbidden');
    expect(await code(moderateReview(author.db, reviewId, 'keep'))).toBe('forbidden');
    expect(await code(moderateReview(reporters[0].db, reviewId, 'delete'))).toBe('forbidden');
    expect(await code(moderateReview(boss.db, reviewId, 'bury' as 'keep'))).toBe('invalid_input');
    expect(await code(moderateReview(boss.db, crypto.randomUUID(), 'keep'))).toBe('review_not_found');
  });

  it('delete removes the review with its reports', async () => {
    const gone = await moderateReview(boss.db, reviewId, 'delete');
    expect(gone).toMatchObject({ id: reviewId, deleted: true });
    const [{ data: review }, { count }] = await Promise.all([
      admin().from('reviews').select('id').eq('id', reviewId),
      admin().from('review_reports').select('review_id', { count: 'exact', head: true }).eq('review_id', reviewId),
    ]);
    expect(review).toEqual([]);
    expect(count).toBe(0);
  });
});
