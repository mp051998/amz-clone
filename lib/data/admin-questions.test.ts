import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { assertStoreAnswer, assertStoreQuestion, listQuestionQueue, questionView } from './admin-questions';

type Reply = { data: unknown; error: unknown; count?: number | null };

/** A client whose reads answer from a queue of replies per table, recording each call. */
function fakeDb(replies: Record<string, Reply[]>) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const db = {
    from: (table: string) => {
      const call = { table, ops: [] as [string, unknown[]][] };
      calls.push(call);
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'order', 'range', 'maybeSingle']) {
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

const question = (id: string, over: Record<string, unknown> = {}) => ({
  id, product_id: 'p1', author_name: 'Sam', body: `Question ${id}?`, answer_count: 0, created_at: '2026-10-01T00:00:00Z', products: { market_id: 'US', title: 'Desk Lamp' }, ...over,
});

it('falls back to the unanswered view', () => {
  expect(questionView('all')).toBe('all');
  expect(questionView('hidden')).toBe('unanswered');
  expect(questionView(undefined)).toBe('unanswered');
});

it('lists a store’s unanswered questions with both counts', async () => {
  const { db, calls } = fakeDb({
    product_questions: [
      { data: [question('q1'), question('q2', { answer_count: 1 })], error: null, count: 30 },
      { data: null, error: null, count: 41 },
      { data: null, error: null, count: 30 },
    ],
    product_answers: [{ data: [{ id: 'a1', question_id: 'q2', author_name: 'Lee', body: 'Yes.', verified: true, helpful_count: 3, created_at: '2026-10-02T00:00:00Z' }], error: null }],
  });
  const page = await listQuestionQueue(db, 'US', { page: 2 });
  expect(page).toMatchObject({ total: 30, page: 2, pageSize: 25, counts: { all: 41, unanswered: 30 } });
  expect(page.questions.map((q) => [q.id, q.productTitle, q.answers.map((a) => a.id)])).toEqual([
    ['q1', 'Desk Lamp', []],
    ['q2', 'Desk Lamp', ['a1']],
  ]);
  expect(page.questions[1].answers[0]).toMatchObject({ author: 'Lee', verified: true, helpful: 3 });

  const [list, all, unanswered, answers] = calls;
  expect(list.ops).toContainEqual(['eq', ['products.market_id', 'US']]);
  expect(list.ops).toContainEqual(['eq', ['answer_count', 0]]);
  expect(list.ops).toContainEqual(['range', [25, 49]]);
  expect(all.ops).not.toContainEqual(['eq', ['answer_count', 0]]);
  expect(unanswered.ops).toContainEqual(['eq', ['answer_count', 0]]);
  expect(answers.ops).toContainEqual(['in', ['question_id', ['q1', 'q2']]]);
});

it('lists every question in the all view, and skips the answer lookup when empty', async () => {
  const { db, calls } = fakeDb({ product_questions: [{ data: [], error: null, count: 0 }] });
  const page = await listQuestionQueue(db, 'IN', { view: 'all' });
  expect(page.questions).toEqual([]);
  expect(calls[0].ops).not.toContainEqual(['eq', ['answer_count', 0]]);
  expect(calls.map((c) => c.table)).toEqual(['product_questions', 'product_questions', 'product_questions']);
});

it('scopes deletes to the store', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const { db, calls } = fakeDb({
    product_questions: [{ data: null, error: null }],
    product_answers: [{ data: { id }, error: null }],
  });
  await expect(assertStoreQuestion(db, 'US', 'not-a-uuid')).rejects.toMatchObject({ code: 'question_not_found' });
  await expect(assertStoreQuestion(db, 'US', id)).rejects.toMatchObject({ code: 'question_not_found' });
  await expect(assertStoreAnswer(db, 'IN', id)).resolves.toBeUndefined();
  expect(calls[1].ops).toContainEqual(['eq', ['product_questions.products.market_id', 'IN']]);
});
