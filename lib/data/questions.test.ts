import { expect, it, vi } from 'vitest';
import { product } from '@/test/fixtures/decision';
import type { Db } from '../db/client';
import { DataError } from './errors';
import { askQuestion, containsPattern, countAnsweredQuestions, listMyAnswers, listMyQuestions, listQuestions, reportAnswer } from './questions';

const catalog = vi.hoisted(() => ({ asked: [] as unknown[] }));
vi.mock('./catalog', () => ({
  // p-gone is no longer in the catalog
  getProducts: async (_db: unknown, ids: string[], opts: unknown) => {
    catalog.asked.push([ids, opts]);
    return ids.filter((id) => id !== 'p-gone').map((id) => product({ id, title: `Product ${id}` }));
  },
}));

type Reply = { data: unknown; error: unknown; count?: number | null };

/** A client whose reads answer from a queue of replies per table, recording each call. */
function fakeDb(replies: Record<string, Reply[]>) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const rpcs: [string, unknown][] = [];
  const db = {
    from: (table: string) => {
      const call = { table, ops: [] as [string, unknown[]][] };
      calls.push(call);
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'gt', 'in', 'ilike', 'order', 'range', 'limit']) {
        q[m] = (...args: unknown[]) => {
          call.ops.push([m, args]);
          return q;
        };
      }
      q.then = (resolve: (r: Reply) => unknown) => resolve(replies[table]?.shift() ?? { data: [], error: null });
      return q;
    },
    rpc: async (fn: string, args: unknown) => {
      rpcs.push([fn, args]);
      const reply = replies[`rpc:${fn}`]?.shift();
      if (reply) return reply;
      return { data: { id: 'q9', product_id: 'p1', user_id: 'u1', author_name: 'Ana', body: 'Is it loud at night?', answer_count: 0, created_at: '2026-10-01T00:00:00Z' }, error: null };
    },
  };
  return { db: db as unknown as Db, calls, rpcs };
}

const question = (id: string, over: Record<string, unknown> = {}) => ({
  id, product_id: 'p1', user_id: 'u2', author_name: 'Sam', body: `Question ${id} about the battery?`, answer_count: 1, created_at: '2026-10-01T00:00:00Z', ...over,
});
const answer = (id: string, questionId: string, over: Record<string, unknown> = {}) => ({
  id, question_id: questionId, user_id: 'u3', author_name: 'Lee', body: 'About a day.', verified: true, helpful_count: 2, created_at: '2026-10-02T00:00:00Z', ...over,
});

it('escapes ilike wildcards so a search matches literally', () => {
  expect(containsPattern('50% off_now')).toBe('%50\\% off\\_now%');
  expect(containsPattern('a\\b')).toBe('%a\\\\b%');
});

it('lists questions with their answers and the viewer’s votes and ownership', async () => {
  const { db, calls } = fakeDb({
    product_questions: [{ data: [question('q1'), question('q2', { user_id: 'me', answer_count: 0 })], error: null, count: 7 }],
    product_answers: [{ data: [answer('a1', 'q1'), answer('a2', 'q1', { user_id: 'me', verified: false })], error: null }],
    answer_votes: [{ data: [{ answer_id: 'a1' }], error: null }],
    answer_reports: [{ data: [{ answer_id: 'a1' }], error: null }],
  });
  const page = await listQuestions(db, 'p1', 'me', { limit: 2, offset: 4 });
  expect(page.total).toBe(7);
  expect(page.items.map((q) => [q.id, q.mine, q.answers.map((a) => a.id)])).toEqual([
    ['q1', false, ['a1', 'a2']],
    ['q2', true, []],
  ]);
  expect(page.items[0].answers[0]).toMatchObject({ verified: true, helpful: 2, votedHelpful: true, reported: true, mine: false, author: 'Lee' });
  expect(page.items[0].answers[1]).toMatchObject({ verified: false, votedHelpful: false, reported: false, mine: true });
  expect(calls[0].ops).toContainEqual(['range', [4, 5]]);
  expect(calls[1].ops).toContainEqual(['in', ['question_id', ['q1', 'q2']]]);
  // the viewer's own reports
  expect(calls.find((c) => c.table === 'answer_reports')?.ops).toEqual([
    ['select', ['answer_id']],
    ['eq', ['user_id', 'me']],
    ['in', ['answer_id', ['a1', 'a2']]],
  ]);
});

it('reports an answer, with a known reason or `other`; your own says so', async () => {
  const { db, rpcs } = fakeDb({
    'rpc:report_answer': [
      { data: { answer_id: 'a1', reported: true, new: true }, error: null },
      { data: { answer_id: 'a1', reported: true, new: false }, error: null },
      { data: null, error: { code: 'P0001', message: 'own_answer', details: null, hint: null } },
      { data: null, error: { code: 'P0002', message: 'answer_not_found', details: null, hint: null } },
    ],
  });
  await reportAnswer(db, 'a1', 'spam');
  await reportAnswer(db, 'a1', 'rude');
  expect(rpcs).toEqual([
    ['report_answer', { p_answer: 'a1', p_reason: 'spam' }],
    ['report_answer', { p_answer: 'a1', p_reason: 'other' }],
  ]);
  await expect(reportAnswer(db, 'a2')).rejects.toMatchObject({ code: 'own_answer', message: 'You can’t report your own answer.' });
  await expect(reportAnswer(db, 'a3')).rejects.toMatchObject({ code: 'answer_not_found' });
});

it('skips the vote lookup for a signed-out viewer', async () => {
  const { db, calls } = fakeDb({
    product_questions: [{ data: [question('q1')], error: null, count: 1 }],
    product_answers: [{ data: [answer('a1', 'q1')], error: null }],
  });
  const page = await listQuestions(db, 'p1', null);
  expect(page.items[0].answers[0].votedHelpful).toBe(false);
  expect(calls.map((c) => c.table)).toEqual(['product_questions', 'product_answers']);
});

it('is empty before the migration', async () => {
  const { db } = fakeDb({ product_questions: [{ data: null, error: { code: 'PGRST205', message: 'missing' } }] });
  expect(await listQuestions(db, 'p1', null)).toEqual({ items: [], total: 0 });
});

it('searches question text and answers', async () => {
  const { db, calls } = fakeDb({
    product_questions: [
      { data: [{ id: 'q1', body: 'How long does the BATTERY last?' }, { id: 'q2', body: 'Does it come in red?' }, { id: 'q3', body: 'Is it waterproof at all?' }], error: null },
      { data: [question('q1'), question('q3')], error: null, count: 2 },
    ],
    product_answers: [{ data: [{ question_id: 'q3' }], error: null }, { data: [], error: null }],
  });
  const page = await listQuestions(db, 'p1', null, { q: ' battery ' });
  expect(page.total).toBe(2);
  // answers are searched only for questions whose own text didn't match
  // (the page query is built first and awaited last)
  const [main, , search] = calls;
  expect(search.ops).toContainEqual(['in', ['question_id', ['q2', 'q3']]]);
  expect(search.ops).toContainEqual(['ilike', ['body', '%battery%']]);
  expect(main.ops).toContainEqual(['in', ['id', ['q1', 'q3']]]);
});

it('counts answered questions, and reads 0 when it can’t', async () => {
  const { db, calls } = fakeDb({
    product_questions: [
      { data: null, error: null, count: 12 },
      { data: null, error: { code: 'PGRST205', message: 'missing' } },
    ],
  });
  expect(await countAnsweredQuestions(db, 'p1')).toBe(12);
  expect(calls[0].ops).toEqual([
    ['select', ['id', { count: 'exact', head: true }]],
    ['eq', ['product_id', 'p1']],
    ['gt', ['answer_count', 0]],
  ]);
  expect(await countAnsweredQuestions(db, 'p1')).toBe(0);
});

it('checks the question length before asking', async () => {
  const { db, rpcs } = fakeDb({});
  await expect(askQuestion(db, 'p1', 'u1', '  short ')).rejects.toMatchObject({ code: 'invalid_input', detail: 'body' });
  await expect(askQuestion(db, 'p1', 'u1', 'x'.repeat(301))).rejects.toBeInstanceOf(DataError);
  expect(rpcs).toEqual([]);

  const q = await askQuestion(db, 'p1', 'u1', '  Is it loud at night?  ');
  expect(rpcs).toEqual([['ask_question', { p_product: 'p1', p_body: 'Is it loud at night?' }]]);
  expect(q).toMatchObject({ id: 'q9', mine: true, answerCount: 0, answers: [] });
});

it("lists the caller's questions in this store with their products", async () => {
  catalog.asked = [];
  const { db, calls } = fakeDb({
    product_questions: [{ data: [question('q1', { user_id: 'u1' }), question('q2', { user_id: 'u1', product_id: 'p-gone' })], error: null }],
  });
  const mine = await listMyQuestions(db, 'IN', 'u1');
  expect(mine.map((m) => [m.question.id, m.question.mine, m.product.title])).toEqual([['q1', true, 'Product p1']]);
  expect(calls[0].ops).toEqual(
    expect.arrayContaining([
      ['eq', ['user_id', 'u1']],
      ['eq', ['products.market_id', 'IN']],
      ['order', ['created_at', { ascending: false }]],
    ]),
  );
  expect(catalog.asked).toEqual([[['p1', 'p-gone'], { includeArchived: true }]]);
});

it("lists the caller's answers with the question each one answers", async () => {
  const { db, calls } = fakeDb({
    product_answers: [
      {
        data: [
          { ...answer('a1', 'q1', { user_id: 'u1' }), product_questions: { id: 'q1', body: 'Does it fold flat?', product_id: 'p1' } },
          { ...answer('a2', 'q2', { user_id: 'u1' }), product_questions: { id: 'q2', body: 'Is it loud?', product_id: 'p-gone' } },
        ],
        error: null,
      },
    ],
  });
  const mine = await listMyAnswers(db, 'US', 'u1');
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({ answer: { id: 'a1', mine: true, helpful: 2 }, question: { id: 'q1', body: 'Does it fold flat?' }, product: { id: 'p1' } });
  expect(calls[0].ops).toEqual(expect.arrayContaining([['eq', ['product_questions.products.market_id', 'US']]]));
});
