import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setProviderOverride } from '@/lib/ai';
import { getProduct } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';
import { askProduct } from '@/lib/data/product-ask';
import { answerQuestion, askQuestion } from '@/lib/data/questions';
import { askTerms } from '@/lib/product-ask';
import { admin, anon, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('Looking for specific info? (ask about a product)', () => {
  let asker: TestUser;
  let owner: TestUser;
  let productId: string;
  let bulletWord: string;
  beforeAll(async () => {
    setProviderOverride(null);
    [asker, owner] = await Promise.all([newUser('Curious Asker'), newUser('Helpful Owner')]);
    productId = (await pickProduct('US', 23)).id;
    const p = (await getProduct(anon(), productId))!;
    // the longest word of its first bullet: something only a few passages say
    bulletWord = askTerms(p.bullets[0]).sort((a, b) => b.length - a.length)[0];
    const q = await askQuestion(asker.db, productId, asker.id, 'Does it survive a zorbleflux test?');
    await answerQuestion(owner.db, q.id, owner.id, 'Mine passed the zorbleflux test twice.');
  });
  afterAll(async () => {
    setProviderOverride(undefined);
    await admin().from('product_questions').delete().eq('product_id', productId).eq('user_id', asker.id);
    await Promise.all([deleteUser(asker), deleteUser(owner)]);
  });

  it('finds answered questions and the product’s own details, for anyone', async () => {
    const qa = await askProduct(anon(), 'US', productId, 'Will it pass a zorbleflux test?');
    expect(qa).toMatchObject({ question: 'Will it pass a zorbleflux test?', answer: null, source: 'rules' });
    expect(qa.snippets[0]).toEqual({ kind: 'qa', text: 'Mine passed the zorbleflux test twice.', question: 'Does it survive a zorbleflux test?' });

    const details = await askProduct(anon(), 'US', productId, `What about ${bulletWord}?`);
    expect(details.snippets.some((s) => s.kind === 'details')).toBe(true);
    expect(details.terms).toContain(bulletWord);

    expect((await askProduct(anon(), 'US', productId, 'qwxyzzy plorbt')).snippets).toEqual([]);
  });

  it('refuses short questions and other stores’ products', async () => {
    expect(await code(askProduct(anon(), 'US', productId, 'hi'))).toBe('invalid_input');
    expect(await code(askProduct(anon(), 'IN', productId, 'battery life'))).toBe('product_not_found');
    expect(await code(askProduct(anon(), 'US', 'no-such-product', 'battery life'))).toBe('product_not_found');
  });

  it('is served at POST /products/:id/ask', async () => {
    const { POST } = await import('@/app/api/v1/products/[id]/ask/route');
    // a bearer token: the cookie client needs a Next request scope
    const token = (await asker.db.auth.getSession()).data.session!.access_token;
    const req = (market: 'US' | 'IN', body: unknown) =>
      new NextRequest(`http://localhost/api/v1/products/${productId}/ask`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'x-market': market, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const at = { params: Promise.resolve({ id: productId }) };
    const ok = await POST(req('US', { question: 'zorbleflux?' }), at);
    expect(ok.status).toBe(200);
    const json = await ok.json();
    expect(json).toMatchObject({ question: 'zorbleflux?', answer: null, source: 'rules', terms: ['zorbleflux'] });
    expect(json.snippets[0]).toMatchObject({ kind: 'qa' });
    expect((await POST(req('US', { question: 'x' }), at)).status).toBe(422);
    expect((await POST(req('IN', { question: 'zorbleflux?' }), at)).status).toBe(404);
  });
});
