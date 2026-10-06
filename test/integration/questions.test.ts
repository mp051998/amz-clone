import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addToCart } from '@/lib/data/cart';
import { placeOrder } from '@/lib/data/orders';
import { DataError } from '@/lib/data/errors';
import { answerQuestion, askQuestion, countAnsweredQuestions, deleteAnswer, deleteQuestion, listQuestions, toggleAnswerHelpful } from '@/lib/data/questions';
import { admin, anon, deleteUser, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('product questions & answers', () => {
  let asker: TestUser;
  let owner: TestUser;
  let browser: TestUser;
  let productId: string;
  beforeAll(async () => {
    [asker, owner, browser] = await Promise.all([newUser('Curious Asker'), newUser('Happy Owner'), newUser('Window Shopper')]);
    productId = (await pickProduct('US', 17)).id;
    await addToCart(owner.db, 'US', productId, 1);
    await placeOrder(owner.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
  });
  afterAll(async () => {
    await admin().from('product_questions').delete().eq('product_id', productId);
    await Promise.all([deleteUser(asker), deleteUser(owner), deleteUser(browser)]);
  });

  it('signed-in shoppers ask; everyone reads; guests can’t ask', async () => {
    const q = await askQuestion(asker.db, productId, asker.id, '  Does it fit in a carry-on bag?  ');
    expect(q).toMatchObject({ body: 'Does it fit in a carry-on bag?', author: 'Curious Asker', mine: true, answerCount: 0 });

    const page = await listQuestions(anon(), productId, null);
    expect(page.items.map((x) => x.id)).toContain(q.id);
    expect(page.items.find((x) => x.id === q.id)?.mine).toBe(false);

    const guest = await anon().rpc('ask_question', { p_product: productId, p_body: 'A guest question here?' });
    expect(guest.error).not.toBeNull();
    expect(await code(askQuestion(asker.db, productId, asker.id, 'does it fit in a CARRY-ON bag?'))).toBe('duplicate');
    expect(await code(askQuestion(asker.db, 'no-such-product', asker.id, 'Is this a real product?'))).toBe('product_not_found');
  });

  it('marks answers from buyers verified; one answer per shopper; counts follow', async () => {
    const [q] = (await listQuestions(anon(), productId, null)).items;
    const fromOwner = await answerQuestion(owner.db, q.id, owner.id, 'Yes, with room to spare.');
    const fromBrowser = await answerQuestion(browser.db, q.id, browser.id, 'I think so?');
    expect(fromOwner).toMatchObject({ verified: true, mine: true, author: 'Happy Owner' });
    expect(fromBrowser.verified).toBe(false);
    expect(await code(answerQuestion(owner.db, q.id, owner.id, 'Answering twice.'))).toBe('duplicate');

    const after = (await listQuestions(anon(), productId, null)).items.find((x) => x.id === q.id)!;
    expect(after.answerCount).toBe(2);
    expect(after.answers).toHaveLength(2);
  });

  it('votes answers helpful once each, never your own, and sorts by it', async () => {
    const [q] = (await listQuestions(anon(), productId, null)).items;
    const browserAnswer = q.answers.find((a) => a.author === 'Window Shopper')!;
    const ownerAnswer = q.answers.find((a) => a.author === 'Happy Owner')!;

    expect(await toggleAnswerHelpful(asker.db, ownerAnswer.id)).toEqual({ answerId: ownerAnswer.id, helpful: true, helpfulCount: 1 });
    expect(await code(toggleAnswerHelpful(owner.db, ownerAnswer.id))).toBe('own_answer');
    const mine = (await listQuestions(asker.db, productId, asker.id)).items.find((x) => x.id === q.id)!;
    expect(mine.answers[0]).toMatchObject({ id: ownerAnswer.id, helpful: 1, votedHelpful: true });

    expect(await toggleAnswerHelpful(asker.db, ownerAnswer.id)).toMatchObject({ helpful: false, helpfulCount: 0 });
    expect(await code(toggleAnswerHelpful(asker.db, '00000000-0000-0000-0000-000000000000'))).toBe('answer_not_found');
    expect(browserAnswer.helpful).toBe(0);
  });

  it('shoppers can’t write the tables directly or forge counts', async () => {
    const [q] = (await listQuestions(anon(), productId, null)).items;
    await browser.db.from('product_questions').update({ answer_count: 99 }).eq('id', q.id);
    await browser.db.from('product_answers').update({ verified: true, helpful_count: 50 }).eq('question_id', q.id);
    const { error } = await browser.db.from('product_questions').insert({ product_id: productId, author_name: 'X', body: 'Inserted directly?' });
    expect(error).not.toBeNull();
    const { data } = await admin().from('product_answers').select('verified, helpful_count, user_id').eq('question_id', q.id);
    expect(data!.find((a) => a.user_id === browser.id)).toMatchObject({ verified: false, helpful_count: 0 });
    const { data: row } = await admin().from('product_questions').select('answer_count').eq('id', q.id).single();
    expect(row!.answer_count).toBe(2);
  });

  it('finds questions by their text or their answers', async () => {
    await askQuestion(browser.db, productId, browser.id, 'What colours does it come in?');
    expect((await listQuestions(anon(), productId, null, { q: 'COLOURS' })).items.map((x) => x.body)).toEqual(['What colours does it come in?']);
    expect((await listQuestions(anon(), productId, null, { q: 'room to spare' })).items.map((x) => x.body)).toEqual(['Does it fit in a carry-on bag?']);
    expect((await listQuestions(anon(), productId, null, { q: '100%_' })).total).toBe(0);
  });

  it('counts only the questions that have an answer', async () => {
    // two questions so far, one of them answered
    expect((await listQuestions(anon(), productId, null)).total).toBe(2);
    expect(await countAnsweredQuestions(anon(), productId)).toBe(1);
  });

  it('only the author (or an admin) deletes; deleting an answer drops the count', async () => {
    const page = await listQuestions(anon(), productId, null);
    const q = page.items.find((x) => x.body === 'Does it fit in a carry-on bag?')!;
    const browserAnswer = q.answers.find((a) => a.author === 'Window Shopper')!;

    expect(await code(deleteAnswer(owner.db, browserAnswer.id))).toBe('answer_not_found');
    await deleteAnswer(browser.db, browserAnswer.id);
    const after = (await listQuestions(anon(), productId, null)).items.find((x) => x.id === q.id)!;
    expect(after.answerCount).toBe(1);

    expect(await code(deleteQuestion(browser.db, q.id))).toBe('question_not_found');
    await admin().from('admins').insert({ user_id: owner.id });
    try {
      const colours = page.items.find((x) => x.body === 'What colours does it come in?')!;
      await deleteQuestion(owner.db, colours.id);
    } finally {
      await admin().from('admins').delete().eq('user_id', owner.id);
    }
    await deleteQuestion(asker.db, q.id);
    expect((await listQuestions(anon(), productId, null)).total).toBe(0);
    const { count } = await admin().from('product_answers').select('id', { count: 'exact', head: true }).eq('question_id', q.id);
    expect(count).toBe(0);
  });
});
