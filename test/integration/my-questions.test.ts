import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { answerQuestion, askQuestion, deleteQuestion, listMyAnswers, listMyQuestions } from '@/lib/data/questions';
import { admin, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

describe('your Q&A', () => {
  let asker: TestUser;
  let answerer: TestUser;
  let inProduct: string;
  let usProduct: string;
  beforeAll(async () => {
    [asker, answerer] = await Promise.all([newUser('Q&A Asker'), newUser('Q&A Answerer')]);
    [inProduct, usProduct] = (await Promise.all([pickProduct('IN', 41), pickProduct('US', 57)])).map((p) => p.id);
  });
  afterAll(async () => {
    await admin().from('product_questions').delete().in('product_id', [inProduct, usProduct]);
    await Promise.all([deleteUser(asker), deleteUser(answerer)]);
  });

  it("lists a shopper's questions and answers per store, newest first, until they're deleted", async () => {
    const first = await askQuestion(asker.db, inProduct, asker.id, 'Does it come with a carry case?');
    const second = await askQuestion(asker.db, inProduct, asker.id, 'Is the warranty valid across India?');
    const elsewhere = await askQuestion(asker.db, usProduct, asker.id, 'Does it work on 110 volts?');
    const answer = await answerQuestion(answerer.db, first.id, answerer.id, 'Yes, a soft pouch.');

    const asked = await listMyQuestions(asker.db, 'IN', asker.id);
    expect(asked.map((m) => m.question.id)).toEqual([second.id, first.id]);
    expect(asked[1]).toMatchObject({ question: { answerCount: 1, mine: true }, product: { id: inProduct } });
    expect((await listMyQuestions(asker.db, 'US', asker.id)).map((m) => m.question.id)).toEqual([elsewhere.id]);
    // someone else's questions aren't theirs
    expect(await listMyQuestions(answerer.db, 'IN', answerer.id)).toEqual([]);

    const answered = await listMyAnswers(answerer.db, 'IN', answerer.id);
    expect(answered).toHaveLength(1);
    expect(answered[0]).toMatchObject({
      answer: { id: answer.id, body: 'Yes, a soft pouch.', mine: true },
      question: { id: first.id, body: 'Does it come with a carry case?' },
      product: { id: inProduct },
    });
    expect(await listMyAnswers(answerer.db, 'US', answerer.id)).toEqual([]);

    // deleting a question takes its answers with it
    await deleteQuestion(asker.db, first.id);
    expect((await listMyQuestions(asker.db, 'IN', asker.id)).map((m) => m.question.id)).toEqual([second.id]);
    expect(await listMyAnswers(answerer.db, 'IN', answerer.id)).toEqual([]);
  });
});
