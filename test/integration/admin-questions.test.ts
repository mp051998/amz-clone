import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertStoreAnswer, assertStoreQuestion, listQuestionQueue } from '@/lib/data/admin-questions';
import { DataError } from '@/lib/data/errors';
import { answerQuestion, askQuestion, deleteAnswer, deleteQuestion } from '@/lib/data/questions';
import { admin, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('question moderation', () => {
  let asker: TestUser;
  let answerer: TestUser;
  let boss: TestUser;
  let usProduct: string;
  let inProduct: string;
  beforeAll(async () => {
    [asker, answerer, boss] = await Promise.all([newUser('Queue Asker'), newUser('Queue Answerer'), newUser('Questions Boss')]);
    const { error } = await admin().from('admins').insert({ user_id: boss.id });
    if (error) throw error;
    [usProduct, inProduct] = (await Promise.all([pickProduct('US', 19), pickProduct('IN', 3)])).map((p) => p.id);
  });
  afterAll(async () => {
    await admin().from('product_questions').delete().in('product_id', [usProduct, inProduct]);
    await admin().from('admins').delete().eq('user_id', boss.id);
    await Promise.all([asker, answerer, boss].map(deleteUser));
  });

  it('lists a store’s questions, unanswered or all, with their answers', async () => {
    const open = await askQuestion(asker.db, usProduct, asker.id, 'Does the queue show me unanswered?');
    const answered = await askQuestion(asker.db, usProduct, asker.id, 'Does the queue show answers too?');
    const reply = await answerQuestion(answerer.db, answered.id, answerer.id, 'It does, inline.');
    const elsewhere = await askQuestion(asker.db, inProduct, asker.id, 'Is this only in the India store?');

    const unanswered = await listQuestionQueue(boss.db, 'US');
    const ids = unanswered.questions.map((q) => q.id);
    expect(ids).toContain(open.id);
    expect(ids).not.toContain(answered.id);
    expect(ids).not.toContain(elsewhere.id);
    expect(unanswered.counts.unanswered).toBe(unanswered.total);
    expect(unanswered.counts.all).toBeGreaterThan(unanswered.counts.unanswered);

    const all = await listQuestionQueue(boss.db, 'US', { view: 'all' });
    const row = all.questions.find((q) => q.id === answered.id)!;
    expect(row).toMatchObject({ productId: usProduct, author: 'Queue Asker', answerCount: 1 });
    expect(row.productTitle).not.toBe('');
    expect(row.answers.map((a) => [a.id, a.author])).toEqual([[reply.id, 'Queue Answerer']]);
    expect(all.questions.map((q) => q.id)).not.toContain(elsewhere.id);

    expect((await listQuestionQueue(boss.db, 'IN', { view: 'all' })).questions.map((q) => q.id)).toContain(elsewhere.id);
  });

  it('checks a question or answer belongs to the store before deleting it', async () => {
    const all = await listQuestionQueue(boss.db, 'US', { view: 'all' });
    const answered = all.questions.find((q) => q.body === 'Does the queue show answers too?')!;
    const [reply] = answered.answers;
    const elsewhere = (await listQuestionQueue(boss.db, 'IN', { view: 'all' })).questions.find((q) => q.body === 'Is this only in the India store?')!;

    await assertStoreQuestion(boss.db, 'US', answered.id);
    await assertStoreAnswer(boss.db, 'US', reply.id);
    expect(await code(assertStoreQuestion(boss.db, 'US', elsewhere.id))).toBe('question_not_found');
    expect(await code(assertStoreAnswer(boss.db, 'IN', reply.id))).toBe('answer_not_found');
    expect(await code(assertStoreQuestion(boss.db, 'US', crypto.randomUUID()))).toBe('question_not_found');

    // the admin removes other shoppers' posts; a shopper can't
    expect(await code(deleteAnswer(asker.db, reply.id))).toBe('answer_not_found');
    await deleteAnswer(boss.db, reply.id);
    const after = (await listQuestionQueue(boss.db, 'US')).questions.map((q) => q.id);
    expect(after).toContain(answered.id);

    await deleteQuestion(boss.db, elsewhere.id);
    expect((await listQuestionQueue(boss.db, 'IN', { view: 'all' })).questions.map((q) => q.id)).not.toContain(elsewhere.id);
  });
});
