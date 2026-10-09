import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { assertStoreAnswer, assertStoreQuestion, keepAnswer, listQuestionQueue, questionView } from './admin-questions';

type Reply = { data: unknown; error: unknown; count?: number | null };

/** A client whose reads answer from a queue of replies per table, recording each call. */
function fakeDb(replies: Record<string, Reply[]>) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const rpcs: [string, unknown][] = [];
  const db = {
    rpc: async (fn: string, args: unknown) => {
      rpcs.push([fn, args]);
      return replies[`rpc:${fn}`]?.shift() ?? { data: null, error: null };
    },
    from: (table: string) => {
      const call = { table, ops: [] as [string, unknown[]][] };
      calls.push(call);
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'gt', 'in', 'order', 'range', 'maybeSingle']) {
        q[m] = (...args: unknown[]) => {
          call.ops.push([m, args]);
          return q;
        };
      }
      q.then = (resolve: (r: Reply) => unknown) => resolve(replies[table]?.shift() ?? { data: [], error: null });
      return q;
    },
  };
  return { db: db as unknown as Db, calls, rpcs };
}

const question = (id: string, over: Record<string, unknown> = {}) => ({
  id, product_id: 'p1', author_name: 'Sam', body: `Question ${id}?`, answer_count: 0, created_at: '2026-10-01T00:00:00Z', products: { market_id: 'US', title: 'Desk Lamp' }, ...over,
});

it('falls back to the unanswered view', () => {
  expect(questionView('all')).toBe('all');
  expect(questionView('reported')).toBe('reported');
  expect(questionView('hidden')).toBe('unanswered');
  expect(questionView(undefined)).toBe('unanswered');
});

it('lists a store’s unanswered questions with every view’s count', async () => {
  const { db, calls } = fakeDb({
    product_questions: [
      { data: [question('q1'), question('q2', { answer_count: 1 })], error: null, count: 30 },
      { data: null, error: null, count: 41 },
      { data: null, error: null, count: 30 },
      { data: null, error: null, count: 2 },
    ],
    product_answers: [{ data: [{ id: 'a1', question_id: 'q2', author_name: 'Lee', body: 'Yes.', verified: true, helpful_count: 3, created_at: '2026-10-02T00:00:00Z', open_reports: 0, moderated_at: null }], error: null }],
  });
  const page = await listQuestionQueue(db, 'US', { page: 2 });
  expect(page).toMatchObject({ total: 30, page: 2, pageSize: 25, counts: { all: 41, unanswered: 30, reported: 2 } });
  expect(page.questions.map((q) => [q.id, q.productTitle, q.answers.map((a) => a.id)])).toEqual([
    ['q1', 'Desk Lamp', []],
    ['q2', 'Desk Lamp', ['a1']],
  ]);
  expect(page.questions[1].answers[0]).toMatchObject({ author: 'Lee', verified: true, helpful: 3, openReports: 0, reasons: {}, moderatedAt: null });

  const [list, all, unanswered, reported, answers] = calls;
  expect(list.ops).toContainEqual(['eq', ['products.market_id', 'US']]);
  expect(list.ops).toContainEqual(['eq', ['answer_count', 0]]);
  expect(list.ops).toContainEqual(['range', [25, 49]]);
  expect(all.ops).not.toContainEqual(['eq', ['answer_count', 0]]);
  expect(unanswered.ops).toContainEqual(['eq', ['answer_count', 0]]);
  expect(reported.ops).toContainEqual(['gt', ['product_answers.open_reports', 0]]);
  expect(String(reported.ops[0][1][0])).toContain('product_answers!inner(id)');
  expect(answers.ops).toContainEqual(['in', ['question_id', ['q1', 'q2']]]);
  // no answer has open reports: nothing more to read
  expect(calls).toHaveLength(5);
});

it('lists questions with a reported answer, each answer with its open reports by reason', async () => {
  const answer = (id: string, over: Record<string, unknown> = {}) => ({
    id, question_id: 'q1', author_name: 'Lee', body: 'Buy it.', verified: false, helpful_count: 0, created_at: '2026-10-02T00:00:00Z', open_reports: 0, moderated_at: null, ...over,
  });
  const { db, calls } = fakeDb({
    product_questions: [{ data: [question('q1', { answer_count: 3 })], error: null, count: 1 }],
    product_answers: [
      { data: [answer('a1', { open_reports: 3 }), answer('a2', { open_reports: 1, moderated_at: '2026-10-05T00:00:00Z' }), answer('a3', { moderated_at: '2026-10-04T00:00:00Z' })], error: null },
    ],
    answer_reports: [
      {
        data: [
          { answer_id: 'a1', reason: 'spam', created_at: '2026-10-03T00:00:00Z' },
          { answer_id: 'a1', reason: 'spam', created_at: '2026-10-06T00:00:00Z' },
          { answer_id: 'a1', reason: 'offensive', created_at: '2026-10-04T00:00:00Z' },
          // filed before a2 was kept: resolved
          { answer_id: 'a2', reason: 'spam', created_at: '2026-10-04T00:00:00Z' },
          { answer_id: 'a2', reason: 'off_topic', created_at: '2026-10-07T00:00:00Z' },
        ],
        error: null,
      },
    ],
  });
  const page = await listQuestionQueue(db, 'US', { view: 'reported' });
  const [a1, a2, a3] = page.questions[0].answers;
  expect(a1).toMatchObject({ openReports: 3, reasons: { spam: 2, offensive: 1 }, lastReportedAt: '2026-10-06T00:00:00Z', moderatedAt: null });
  expect(a2).toMatchObject({ openReports: 1, reasons: { off_topic: 1 }, lastReportedAt: '2026-10-07T00:00:00Z', moderatedAt: '2026-10-05T00:00:00Z' });
  expect(a3).toMatchObject({ openReports: 0, reasons: {}, lastReportedAt: null, moderatedAt: '2026-10-04T00:00:00Z' });

  const list = calls[0];
  expect(String(list.ops[0][1][0])).toContain('product_answers!inner(id)');
  expect(list.ops).toContainEqual(['gt', ['product_answers.open_reports', 0]]);
  expect(list.ops).not.toContainEqual(['eq', ['answer_count', 0]]);
  // only the reported answers' reports are read
  expect(calls.find((c) => c.table === 'answer_reports')?.ops).toContainEqual(['in', ['answer_id', ['a1', 'a2']]]);
});

it('keeps a reported answer', async () => {
  const id = '00000000-0000-4000-8000-000000000002';
  const { db, rpcs } = fakeDb({ 'rpc:admin_keep_answer': [{ data: { id, open_reports: 0, moderated_at: '2026-10-09T00:00:00Z' }, error: null }] });
  await expect(keepAnswer(db, 'nope')).rejects.toMatchObject({ code: 'answer_not_found' });
  await expect(keepAnswer(db, id)).resolves.toEqual({ id, moderatedAt: '2026-10-09T00:00:00Z' });
  expect(rpcs).toEqual([['admin_keep_answer', { p_answer: id }]]);
});

it('lists every question in the all view, and skips the answer lookup when empty', async () => {
  const { db, calls } = fakeDb({ product_questions: [{ data: [], error: null, count: 0 }] });
  const page = await listQuestionQueue(db, 'IN', { view: 'all' });
  expect(page.questions).toEqual([]);
  expect(calls[0].ops).not.toContainEqual(['eq', ['answer_count', 0]]);
  expect(calls.map((c) => c.table)).toEqual(['product_questions', 'product_questions', 'product_questions', 'product_questions']);
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
