import { expect, it, vi } from 'vitest';
import type { Db } from '../db/client';

vi.mock('./catalog', () => ({
  getProducts: async (_db: unknown, ids: string[]) => ids.filter((id) => id !== 'gone').map((id) => ({ id, title: `Product ${id}` })),
}));

const { reviewerProfile, PROFILE_PAGE_SIZE } = await import('./reviews');

const USER = '11111111-2222-4333-8444-555555555555';
const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: `r${n}`, user_id: USER, author_name: 'Priya S', rating: 4, title: `T${n}`, body: 'B', verified: true,
  helpful_count: n % 3, created_at: `2026-10-${String(30 - n).padStart(2, '0')}T00:00:00Z`, hidden_at: null, photos: [], product_id: `p${n}`, ...over,
});

function fakeDb(rows: unknown[]) {
  const ops: [string, unknown[]][] = [];
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'order', 'limit']) q[m] = (...args: unknown[]) => (ops.push([m, args]), q);
  q.then = (resolve: (r: unknown) => unknown) => resolve({ data: rows, error: null });
  return { db: { from: (t: string) => (ops.push(['from', [t]]), q) } as unknown as Db, ops };
}

it('reads the store’s visible reviews by the reviewer, newest first, and totals the helpful votes', async () => {
  const rows = Array.from({ length: 12 }, (_, i) => row(i + 1));
  const { db, ops } = fakeDb(rows);
  const p = (await reviewerProfile(db, 'IN', USER))!;
  expect(ops).toContainEqual(['eq', ['user_id', USER]]);
  expect(ops).toContainEqual(['eq', ['products.market_id', 'IN']]);
  expect(ops).toContainEqual(['is', ['hidden_at', null]]);
  expect(ops).toContainEqual(['order', ['created_at', { ascending: false }]]);
  expect(p).toMatchObject({ name: 'Priya S', initial: 'P', total: 12, page: 1, pageCount: 2 });
  expect(p.helpful).toBe(rows.reduce((n, r) => n + r.helpful_count, 0));
  expect(p.reviews).toHaveLength(PROFILE_PAGE_SIZE);
  expect(p.reviews[0]).toMatchObject({ review: { id: 'r1', authorId: USER, mine: false }, product: { id: 'p1' } });

  const second = (await reviewerProfile(fakeDb(rows).db, 'IN', USER, 9))!;
  expect(second.page).toBe(2);
  expect(second.reviews.map((r) => r.review.id)).toEqual(['r11', 'r12']);
});

it('nothing for an unknown id or someone with no visible reviews; a product gone from the store drops out', async () => {
  const { db, ops } = fakeDb([row(1)]);
  expect(await reviewerProfile(db, 'US', 'not-a-uuid')).toBeNull();
  expect(ops).toEqual([]);
  expect(await reviewerProfile(fakeDb([]).db, 'US', USER)).toBeNull();
  const p = (await reviewerProfile(fakeDb([row(1, { product_id: 'gone' }), row(2)]).db, 'US', USER))!;
  expect(p.total).toBe(2);
  expect(p.reviews.map((r) => r.review.id)).toEqual(['r2']);
});

it('is a Vine Voice when one of their visible reviews is a Vine review', async () => {
  expect((await reviewerProfile(fakeDb([row(1), row(2)]).db, 'US', USER))!.vine).toBe(false);
  const p = (await reviewerProfile(fakeDb([row(1), row(2, { vine: true, verified: false })]).db, 'US', USER))!;
  expect(p.vine).toBe(true);
  expect(p.reviews.map((r) => r.review.vine)).toEqual([undefined, true]);
});
