import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { listReviews, matchesReviewFilter, rateProduct, readReviewFilter, reviewFacets, reviewFitCounts, reviewerProfile, upsertReview } from './reviews';

type Reply = { data: unknown; error: unknown; count?: number | null };

/** A client whose reads answer from a queue of replies per table, recording each call. */
function fakeDb(replies: Record<string, Reply[]>) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const db = {
    from: (table: string) => {
      const call = { table, ops: [] as [string, unknown[]][] };
      calls.push(call);
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'is', 'in', 'not', 'order', 'range', 'limit', 'maybeSingle', 'single', 'insert', 'update', 'filter', 'or']) {
        q[m] = (...args: unknown[]) => {
          call.ops.push([m, args]);
          return q;
        };
      }
      q.then = (resolve: (r: Reply) => unknown) => resolve(replies[table]?.shift() ?? { data: [], error: null });
      return q;
    },
  };
  return { db: db as unknown as Db, calls };
}

const row = (id: string, rating: number, over: Record<string, unknown> = {}) => ({
  id, user_id: 'u9', author_name: 'Sam', rating, title: 'T', body: 'B', verified: true, helpful_count: 0, created_at: '2026-10-01T00:00:00Z', hidden_at: null, ...over,
});

it('reads the stars, verified and photos query', () => {
  expect(readReviewFilter(undefined, undefined, '1')).toEqual({ photos: true });
  expect(readReviewFilter('5', 'true', 'no')).toEqual({ stars: 5, verified: true });
  expect(readReviewFilter('4', '1')).toEqual({ stars: 4, verified: true });
  expect(readReviewFilter(' Critical ', 'true')).toEqual({ stars: 'critical', verified: true });
  expect(readReviewFilter(5, true)).toEqual({ stars: 5, verified: true });
  expect(readReviewFilter('6', 'yes')).toEqual({});
  expect(readReviewFilter('2.5', null)).toEqual({});
  expect(readReviewFilter(undefined, undefined)).toEqual({});
  expect(readReviewFilter(undefined, undefined, undefined, '  too   loud ')).toEqual({ q: 'too loud' });
  expect(readReviewFilter('5', undefined, undefined, 'x')).toEqual({ stars: 5 });
});

it('matches reviews to a filter', () => {
  expect(matchesReviewFilter({ rating: 5, verified: true, photos: [] }, { photos: true })).toBe(false);
  expect(matchesReviewFilter({ rating: 5, verified: true, photos: [{}] }, { photos: true, stars: 'positive' })).toBe(true);
  expect(matchesReviewFilter({ rating: 4, verified: false }, { stars: 'positive' })).toBe(true);
  expect(matchesReviewFilter({ rating: 4, verified: false }, { stars: 'positive', verified: true })).toBe(false);
  expect(matchesReviewFilter({ rating: 3, verified: true }, { stars: 'critical' })).toBe(true);
  expect(matchesReviewFilter({ rating: 3, verified: true }, { stars: 2 })).toBe(false);
  expect(matchesReviewFilter({ rating: 1, verified: false }, {})).toBe(true);
  expect(matchesReviewFilter({ rating: 5, verified: true, title: 'Great SOUND', body: 'Loud' }, { q: 'sound' })).toBe(true);
  expect(matchesReviewFilter({ rating: 5, verified: true, title: 'Great', body: 'Battery lasts' }, { q: 'battery', stars: 5 })).toBe(true);
  expect(matchesReviewFilter({ rating: 5, verified: true, title: 'Great', body: 'Loud' }, { q: 'battery' })).toBe(false);
});

it('asks the database for the filtered reviews and pins the viewer’s own only when it passes', async () => {
  const { db, calls } = fakeDb({
    reviews: [
      { data: [row('r1', 5), row('r2', 4)], error: null, count: 17 },
      { data: row('own', 2, { user_id: 'u1' }), error: null },
    ],
  });
  const page = await listReviews(db, 'p1', 'u1', { filter: { stars: 'positive', verified: true } });
  expect(page.total).toBe(17);
  expect(page.items.map((r) => r.id)).toEqual(['r1', 'r2']);
  expect(page.mine?.id).toBe('own');
  expect(calls[0].ops).toContainEqual(['gte', ['rating', 4]]);
  expect(calls[0].ops).toContainEqual(['lte', ['rating', 5]]);
  expect(calls[0].ops).toContainEqual(['eq', ['verified', true]]);

  const one = fakeDb({ reviews: [{ data: [row('r3', 2)], error: null, count: 1 }, { data: row('own', 2, { user_id: 'u1' }), error: null }] });
  const twos = await listReviews(one.db, 'p1', 'u1', { filter: { stars: 2 } });
  expect(twos.items.map((r) => r.id)).toEqual(['own', 'r3']);
  expect(one.calls[0].ops).toContainEqual(['eq', ['rating', 2]]);
  expect(one.calls[0].ops).not.toContainEqual(['eq', ['verified', true]]);
  expect(one.calls[0].ops).not.toContainEqual(['filter', ['photos', 'neq', '{}']]);

  const pics = fakeDb({ reviews: [{ data: [row('r4', 5, { photos: ['u9/a.jpg'] })], error: null, count: 1 }] });
  const withPhotos = await listReviews(pics.db, 'p1', null, { filter: { photos: true } });
  expect(withPhotos.items[0].photos.map((p) => p.path)).toEqual(['u9/a.jpg']);
  expect(pics.calls[0].ops).toContainEqual(['filter', ['photos', 'neq', '{}']]);

  const words = fakeDb({ reviews: [{ data: [row('r5', 5, { body: 'Battery is 50% better' })], error: null, count: 1 }] });
  await listReviews(words.db, 'p1', null, { filter: { q: '50%' } });
  expect(words.calls[0].ops).toContainEqual(['or', ['title.ilike."%50\\\\%%",body.ilike."%50\\\\%%"']]);
  expect(one.calls[0].ops.some(([m]) => m === 'or')).toBe(false);
});

it('counts visible written reviews per star: all, verified, with photos, verified with photos', async () => {
  const { db, calls } = fakeDb({
    reviews: [
      {
        data: [
          { rating: 5, verified: true, photos: ['u/a.jpg'] },
          { rating: 5, verified: false, photos: ['u/b.jpg'] },
          { rating: 5, verified: true, photos: [] },
          { rating: 1, verified: true, photos: [] },
          { rating: 9, verified: true, photos: [] },
        ],
        error: null,
      },
    ],
  });
  const facets = await reviewFacets(db, 'p1');
  expect(facets[5]).toEqual({ all: 3, verified: 2, photos: 2, verifiedPhotos: 1 });
  expect(facets[1]).toEqual({ all: 1, verified: 1, photos: 0, verifiedPhotos: 0 });
  expect(facets[3]).toEqual({ all: 0, verified: 0, photos: 0, verifiedPhotos: 0 });
  expect(calls[0].ops).toContainEqual(['is', ['hidden_at', null]]);
});

it('counts how visible reviews say it fits, ignoring anything else', async () => {
  const { db, calls } = fakeDb({
    reviews: [{ data: [{ fit: 'small' }, { fit: 'true_to_size' }, { fit: 'true_to_size' }, { fit: 'huge' }, { fit: 'large' }], error: null }],
  });
  expect(await reviewFitCounts(db, 'p1')).toEqual({ small: 1, true_to_size: 2, large: 1 });
  expect(calls[0].ops).toContainEqual(['not', ['fit', 'is', null]]);
  expect(calls[0].ops).toContainEqual(['is', ['hidden_at', null]]);
  // before the fit migration (or on any error): nothing to show
  const failing = fakeDb({ reviews: [{ data: null, error: { code: '42703', message: 'column reviews.fit does not exist' } }] });
  expect(await reviewFitCounts(failing.db, 'p1')).toEqual({ small: 0, true_to_size: 0, large: 0 });
});

it('saves how it fits with a review, and refuses any other answer', async () => {
  const input = { rating: 4, title: 'Snug', body: 'Order a size up.' };
  await expect(upsertReview(fakeDb({}).db, 'p1', 'u1', { ...input, fit: 'tiny' })).rejects.toMatchObject({ code: 'invalid_input', detail: 'fit' });

  const created = fakeDb({ reviews: [{ data: null, error: null }, { data: row('r1', 4, { fit: 'small' }), error: null }] });
  const review = await upsertReview(created.db, 'p1', 'u1', { ...input, fit: 'small' });
  expect(review.fit).toBe('small');
  expect(created.calls[1].ops).toContainEqual(['insert', [expect.objectContaining({ fit: 'small' })]]);

  // a rewrite without `fit` keeps it; null clears it
  const kept = fakeDb({ reviews: [{ data: { id: 'r1', photos: [] }, error: null }, { data: row('r1', 4, { fit: 'small' }), error: null }] });
  await upsertReview(kept.db, 'p1', 'u1', input);
  expect(kept.calls[1].ops.find(([m]) => m === 'update')![1][0]).not.toHaveProperty('fit');
  const cleared = fakeDb({ reviews: [{ data: { id: 'r1', photos: [] }, error: null }, { data: row('r1', 4), error: null }] });
  expect((await upsertReview(cleared.db, 'p1', 'u1', { ...input, fit: null })).fit).toBeUndefined();
  expect(cleared.calls[1].ops.find(([m]) => m === 'update')![1][0]).toMatchObject({ fit: null });
});

it('reads the Vine mark with each review, and leaves it off the rest', async () => {
  const { db, calls } = fakeDb({ reviews: [{ data: [row('r1', 5, { vine: true, verified: false }), row('r2', 4, { vine: false })], error: null, count: 2 }] });
  const page = await listReviews(db, 'p1', null);
  expect(String(calls[0].ops.find(([m]) => m === 'select')![1][0]).split(', ')).toContain('vine');
  expect(page.items[0]).toMatchObject({ id: 'r1', vine: true, verified: false });
  expect(page.items[1]).not.toHaveProperty('vine');
});

it('lists written reviews only, and hands back the viewer’s star-only rating as mine without pinning it', async () => {
  const { db, calls } = fakeDb({
    reviews: [
      { data: [row('r1', 5)], error: null, count: 1 },
      { data: row('own', 3, { user_id: 'u1', title: '', body: '' }), error: null },
    ],
  });
  const page = await listReviews(db, 'p1', 'u1');
  expect(calls[0].ops).toContainEqual(['neq', ['body', '']]);
  expect(page.items.map((r) => r.id)).toEqual(['r1']);
  expect(page.mine).toMatchObject({ id: 'own', rating: 3, title: '', body: '' });
});

it('counts facets over written reviews only', async () => {
  const { db, calls } = fakeDb({ reviews: [{ data: [{ rating: 4, verified: true, photos: [] }], error: null }] });
  expect((await reviewFacets(db, 'p1'))[4].all).toBe(1);
  expect(calls[0].ops).toContainEqual(['neq', ['body', '']]);
});

it('leaves star-only ratings off a reviewer’s public profile', async () => {
  const { db, calls } = fakeDb({ reviews: [{ data: [], error: null }] });
  expect(await reviewerProfile(db, 'US', '00000000-0000-4000-8000-000000000001')).toBeNull();
  expect(calls[0].ops).toContainEqual(['neq', ['body', '']]);
});

it('saves a star-only rating when the headline and review are both empty, and refuses half a review', async () => {
  const created = fakeDb({ reviews: [{ data: null, error: null }, { data: row('r1', 4, { title: '', body: '' }), error: null }] });
  const rating = await upsertReview(created.db, 'p1', 'u1', { rating: 4, title: '  ', body: '' });
  expect(rating).toMatchObject({ rating: 4, title: '', body: '', photos: [] });
  expect(created.calls[1].ops).toContainEqual(['insert', [expect.objectContaining({ rating: 4, title: '', body: '', photos: [] })]]);

  const half = 'Add a headline and a review, or leave both empty to just rate it.';
  await expect(upsertReview(fakeDb({}).db, 'p1', 'u1', { rating: 4, title: 'Great', body: '' })).rejects.toMatchObject({ code: 'invalid_input', detail: 'body', message: half });
  await expect(upsertReview(fakeDb({}).db, 'p1', 'u1', { rating: 4, title: '', body: 'Great' })).rejects.toMatchObject({ code: 'invalid_input', detail: 'title', message: half });
  await expect(upsertReview(fakeDb({}).db, 'p1', 'u1', { rating: 0, title: '', body: '' })).rejects.toMatchObject({ detail: 'rating' });
  await expect(upsertReview(fakeDb({}).db, 'p1', 'u1', { rating: 4, title: '', body: '', photos: ['u1/a.jpg'] })).rejects.toMatchObject({ code: 'invalid_input', detail: 'photos' });
});

it('turns a review rewritten without words into a rating, dropping its photos', async () => {
  const removed: string[][] = [];
  const { db, calls } = fakeDb({ reviews: [{ data: { id: 'r1', photos: ['u1/a.jpg'] }, error: null }, { data: row('r1', 2, { title: '', body: '' }), error: null }] });
  (db as unknown as { storage: unknown }).storage = { from: () => ({ remove: async (paths: string[]) => (removed.push(paths), { error: null }) }) };
  await upsertReview(db, 'p1', 'u1', { rating: 2, title: '', body: '' });
  expect(calls[1].ops.find(([m]) => m === 'update')![1][0]).toMatchObject({ rating: 2, title: '', body: '', photos: [] });
  expect(removed).toEqual([['u1/a.jpg']]);
});

it('rates a product with stars alone: a new rating, or new stars on what the shopper already wrote', async () => {
  const fresh = fakeDb({ reviews: [{ data: null, error: null }, { data: row('r1', 5, { title: '', body: '' }), error: null }] });
  expect(await rateProduct(fresh.db, 'p1', 'u1', 5)).toMatchObject({ id: 'r1', rating: 5, body: '' });
  expect(fresh.calls[1].ops).toContainEqual(['insert', [expect.objectContaining({ product_id: 'p1', rating: 5, title: '', body: '' })]]);

  const rewritten = fakeDb({ reviews: [{ data: { id: 'r2' }, error: null }, { data: row('r2', 3), error: null }] });
  expect(await rateProduct(rewritten.db, 'p1', 'u1', '3')).toMatchObject({ id: 'r2', rating: 3, title: 'T', body: 'B' });
  expect(rewritten.calls[1].ops).toContainEqual(['update', [{ rating: 3 }]]);

  await expect(rateProduct(fakeDb({}).db, 'p1', 'u1', 6)).rejects.toMatchObject({ code: 'invalid_input', detail: 'rating' });
});
