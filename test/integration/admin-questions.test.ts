import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertStoreAnswer, assertStoreQuestion, keepAnswer, listQuestionQueue } from '@/lib/data/admin-questions';
import { DataError } from '@/lib/data/errors';
import { answerQuestion, askQuestion, deleteAnswer, deleteQuestion, listQuestions, reportAnswer } from '@/lib/data/questions';
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

describe('reporting an answer', () => {
  let asker: TestUser;
  let answerer: TestUser;
  let reporters: TestUser[];
  let boss: TestUser;
  let product: string;
  beforeAll(async () => {
    [asker, answerer, boss, ...reporters] = await Promise.all([
      newUser('Report Asker'),
      newUser('Report Answerer'),
      newUser('Reports Boss'),
      newUser('Reporter One'),
      newUser('Reporter Two'),
    ]);
    const { error } = await admin().from('admins').insert({ user_id: boss.id });
    if (error) throw error;
    product = (await pickProduct('US', 23)).id;
  });
  afterAll(async () => {
    await admin().from('product_questions').delete().eq('product_id', product);
    await admin().from('admins').delete().eq('user_id', boss.id);
    await Promise.all([asker, answerer, boss, ...reporters].map(deleteUser));
  });

  it('a shopper reports someone else’s answer once; the admin sees it under Reported and keeps it', async () => {
    const q = await askQuestion(asker.db, product, asker.id, 'Will a reported answer reach the queue?');
    const a = await answerQuestion(answerer.db, q.id, answerer.id, 'Buy my thing at example.test instead.');
    const [one, two] = reporters;

    expect(await code(reportAnswer(answerer.db, a.id, 'spam'))).toBe('own_answer');
    expect(await code(reportAnswer(one.db, crypto.randomUUID()))).toBe('answer_not_found');
    await reportAnswer(one.db, a.id, 'spam');
    await reportAnswer(one.db, a.id, 'offensive'); // again: nothing changes
    await reportAnswer(two.db, a.id, 'off_topic');

    // the reporter sees that they reported it; others don't
    const seen = async (u: TestUser | null) =>
      (await listQuestions((u ?? asker).db, product, u?.id ?? null)).items.find((x) => x.id === q.id)!.answers[0].reported;
    expect(await seen(one)).toBe(true);
    expect(await seen(asker)).toBe(false);
    expect(await seen(null)).toBe(false);

    // shoppers can't read or write reports directly
    expect((await asker.db.from('answer_reports').select('answer_id').eq('answer_id', a.id)).data).toEqual([]);
    const forged = await asker.db.from('answer_reports').insert({ answer_id: a.id, user_id: asker.id, reason: 'spam' });
    expect(forged.error).not.toBeNull();
    await asker.db.from('product_answers').update({ open_reports: 0 }).eq('id', a.id);
    expect((await admin().from('product_answers').select('open_reports').eq('id', a.id).single()).data).toEqual({ open_reports: 2 });

    const reported = await listQuestionQueue(boss.db, 'US', { view: 'reported' });
    const row = reported.questions.find((x) => x.id === q.id)!;
    expect(row.answers[0]).toMatchObject({ id: a.id, openReports: 2, reasons: { spam: 1, off_topic: 1 }, moderatedAt: null });
    expect(reported.counts.reported).toBe(reported.total);
    expect(reported.counts.reported).toBeGreaterThanOrEqual(1);
    expect((await listQuestionQueue(boss.db, 'IN', { view: 'reported' })).questions.map((x) => x.id)).not.toContain(q.id);

    // a shopper can't keep it
    expect(await code(keepAnswer(asker.db, a.id))).toBe('forbidden');
    const kept = await keepAnswer(boss.db, a.id);
    expect(kept.id).toBe(a.id);
    const after = await listQuestionQueue(boss.db, 'US', { view: 'reported' });
    expect(after.questions.map((x) => x.id)).not.toContain(q.id);
    expect(after.counts.reported).toBe(reported.counts.reported - 1);
    const all = (await listQuestionQueue(boss.db, 'US', { view: 'all' })).questions.find((x) => x.id === q.id)!;
    expect(all.answers[0]).toMatchObject({ openReports: 0, reasons: {}, moderatedAt: kept.moderatedAt });

    // kept: the same reporters can't flag it again, a new one can
    await reportAnswer(one.db, a.id, 'spam');
    expect((await listQuestionQueue(boss.db, 'US', { view: 'reported' })).questions.map((x) => x.id)).not.toContain(q.id);
    await reportAnswer(asker.db, a.id, 'other');
    const again = (await listQuestionQueue(boss.db, 'US', { view: 'reported' })).questions.find((x) => x.id === q.id)!;
    expect(again.answers[0]).toMatchObject({ openReports: 1, reasons: { other: 1 } });

    // deleting the answer takes its reports with it
    await deleteAnswer(boss.db, a.id);
    expect((await admin().from('answer_reports').select('answer_id').eq('answer_id', a.id)).data).toEqual([]);
  });
});
