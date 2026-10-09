import { expect, it, vi } from 'vitest';
import type { Db } from '../db/client';
import type { ProductInsight } from '../decision/types';
import { getInsight, withReviewCounts } from './insights';

vi.mock('server-only', () => ({}));

const ROW = {
  product_id: 'p1',
  scores: { value: 4 },
  pros: [],
  cons: [],
  best_for: '',
  summary: 'Owners rate it 4.0 out of 5.',
  praised: [{ theme: 'Value for money', count: 5460 }, { theme: 'Space-saving', count: 2248 }],
  criticized: [{ theme: 'Weight range', count: 1073 }],
  source: 'rules',
  updated_at: '2026-10-01T00:00:00Z',
};

/** product_insights answers with `row`; reviews with `reviews` (or an error). */
function fakeDb(row: unknown, reviews: unknown[] | Error) {
  const reads: string[] = [];
  const db = {
    from(table: string) {
      reads.push(table);
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'neq', 'is', 'range']) q[m] = () => q;
      q.maybeSingle = async () => ({ data: row, error: null });
      q.then = (resolve: (r: unknown) => unknown) =>
        resolve(reviews instanceof Error ? { data: null, error: { message: reviews.message, code: 'XX000', details: '', hint: '' } } : { data: reviews, error: null });
      return q;
    },
  };
  return { db: db as unknown as Db, reads };
}

it('counts a rules insight’s themes from the written reviews, dropping what none mention', async () => {
  const { db } = fakeDb(ROW, [
    { rating: 5, title: 'Worth it', body: 'Good price.' },
    { rating: 2, title: 'Light', body: 'The weight is wrong.' },
  ]);
  const insight = (await getInsight(db, 'p1'))!;
  expect(insight.praised).toEqual([{ theme: 'Value for money', count: 1 }]);
  expect(insight.criticized).toEqual([{ theme: 'Weight range', count: 1 }]);
  expect(insight.summary).toBe('Owners rate it 4.0 out of 5.');
});

it('shows no counts when the reviews can’t be read, and leaves AI insights as they are', async () => {
  expect(await getInsight(fakeDb(ROW, new Error('boom')).db, 'p1')).toMatchObject({ praised: [], criticized: [] });
  expect(await getInsight(fakeDb(null, []).db, 'p1')).toBeNull();

  const ai = { ...ROW, source: 'ai', praised: [{ theme: 'Sound', count: 4 }] };
  expect((await getInsight(fakeDb(ai, []).db, 'p1'))!.praised).toEqual([{ theme: 'Sound', count: 4 }]);

  const { db, reads } = fakeDb(null, []);
  const none = { productId: 'p1', scores: {}, pros: [], cons: [], bestFor: '', summary: '', praised: [], criticized: [], source: 'rules', updatedAt: '2026-10-01T00:00:00Z' } satisfies ProductInsight;
  expect(await withReviewCounts(db, none)).toBe(none);
  expect(reads).toEqual([]);
});
