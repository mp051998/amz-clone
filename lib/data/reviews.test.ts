import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { listReviews, matchesReviewFilter, readReviewFilter, reviewFacets } from './reviews';

type Reply = { data: unknown; error: unknown; count?: number | null };

/** A client whose reads answer from a queue of replies per table, recording each call. */
function fakeDb(replies: Record<string, Reply[]>) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const db = {
    from: (table: string) => {
      const call = { table, ops: [] as [string, unknown[]][] };
      calls.push(call);
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'gte', 'lte', 'is', 'in', 'order', 'range', 'maybeSingle']) {
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

it('reads the stars and verified query', () => {
  expect(readReviewFilter('4', '1')).toEqual({ stars: 4, verified: true });
  expect(readReviewFilter(' Critical ', 'true')).toEqual({ stars: 'critical', verified: true });
  expect(readReviewFilter(5, true)).toEqual({ stars: 5, verified: true });
  expect(readReviewFilter('6', 'yes')).toEqual({});
  expect(readReviewFilter('2.5', null)).toEqual({});
  expect(readReviewFilter(undefined, undefined)).toEqual({});
});

it('matches reviews to a filter', () => {
  expect(matchesReviewFilter({ rating: 4, verified: false }, { stars: 'positive' })).toBe(true);
  expect(matchesReviewFilter({ rating: 4, verified: false }, { stars: 'positive', verified: true })).toBe(false);
  expect(matchesReviewFilter({ rating: 3, verified: true }, { stars: 'critical' })).toBe(true);
  expect(matchesReviewFilter({ rating: 3, verified: true }, { stars: 2 })).toBe(false);
  expect(matchesReviewFilter({ rating: 1, verified: false }, {})).toBe(true);
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
});

it('counts visible written reviews per star, all and verified', async () => {
  const { db, calls } = fakeDb({
    reviews: [{ data: [{ rating: 5, verified: true }, { rating: 5, verified: false }, { rating: 1, verified: true }, { rating: 9, verified: true }], error: null }],
  });
  const facets = await reviewFacets(db, 'p1');
  expect(facets[5]).toEqual({ all: 2, verified: 1 });
  expect(facets[1]).toEqual({ all: 1, verified: 1 });
  expect(facets[3]).toEqual({ all: 0, verified: 0 });
  expect(calls[0].ops).toContainEqual(['is', ['hidden_at', null]]);
});
