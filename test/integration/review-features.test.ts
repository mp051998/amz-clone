import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataError } from '@/lib/data/errors';
import { listReviews, reviewFeatureRows, upsertReview } from '@/lib/data/reviews';
import { featureRatings } from '@/lib/review-features';
import { admin, anon, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}${err.detail ? `:${err.detail}` : ''}` : String(err);
  }
  return 'no error';
};

describe('ratings by feature, on reviews', () => {
  let shoppers: TestUser[];
  let productId: string;
  const review = { rating: 4, title: 'By feature', body: 'Rated its features.' };

  beforeAll(async () => {
    shoppers = await Promise.all(['Feat One', 'Feat Two', 'Feat Three', 'Feat Four'].map((n) => newUser(n)));
    // IN offset 117 is this file's
    productId = (await pickProduct('IN', 117)).id;
  });
  afterAll(async () => {
    await admin().from('reviews').delete().eq('product_id', productId).in('user_id', shoppers.map((u) => u.id));
    await Promise.all(shoppers.map(deleteUser));
  });

  it('are saved with the review and averaged over the visible ones', async () => {
    const [one, two, three, four] = shoppers;
    const mine = await upsertReview(one.db, productId, one.id, { ...review, authorName: 'Feat One', features: { easy_to_use: 5, value_for_money: 3 } });
    expect(mine.features).toEqual({ easy_to_use: 5, value_for_money: 3 });
    await upsertReview(two.db, productId, two.id, { ...review, authorName: 'Feat Two', features: { easy_to_use: 4, value_for_money: 4, sturdiness: null } });
    await upsertReview(three.db, productId, three.id, { ...review, authorName: 'Feat Three', features: { easy_to_use: 4 } });
    expect((await upsertReview(four.db, productId, four.id, { ...review, authorName: 'Feat Four' })).features).toBeUndefined();

    const rows = await reviewFeatureRows(anon(), productId);
    expect(rows).toEqual(expect.arrayContaining([{ feature: 'easy_to_use', average: 4.3, count: 3 }, { feature: 'value_for_money', average: 3.5, count: 2 }]));
    // value for money has only 2 ratings
    expect(featureRatings(rows)).toEqual([{ feature: 'easy_to_use', label: 'Easy to use', average: 4.3, count: 3 }]);
    const { items } = await listReviews(anon(), productId, null, { limit: 10, sort: 'recent' });
    expect(Object.fromEntries(items.filter((r) => r.title === 'By feature').map((r) => [r.author, r.features ?? null]))).toEqual({
      'Feat One': { easy_to_use: 5, value_for_money: 3 },
      'Feat Two': { easy_to_use: 4, value_for_money: 4 },
      'Feat Three': { easy_to_use: 4 },
      'Feat Four': null,
    });

    // a hidden review's ratings stop counting
    const { error } = await admin().from('reviews').update({ hidden_at: new Date().toISOString(), hidden_reason: 'admin' }).eq('product_id', productId).eq('user_id', three.id);
    if (error) throw error;
    expect((await reviewFeatureRows(anon(), productId)).find((r) => r.feature === 'easy_to_use')).toEqual({ feature: 'easy_to_use', average: 4.5, count: 2 });
  });

  it('are kept on a rewrite that leaves them out, cleared with null, and only 1–5 stars on known features', async () => {
    const [one] = shoppers;
    expect((await upsertReview(one.db, productId, one.id, { ...review, title: 'Still' })).features).toEqual({ easy_to_use: 5, value_for_money: 3 });
    expect((await upsertReview(one.db, productId, one.id, { ...review, features: null })).features).toBeUndefined();
    for (const features of [{ easy_to_use: 6 }, { easy_to_use: 2.5 }, { made_up: 3 }, [4], 'easy']) {
      expect(await failure(upsertReview(one.db, productId, one.id, { ...review, features }))).toBe('invalid_input:features');
    }
    // and the table holds to the shape when written directly
    for (const features of [{ easy_to_use: 0 }, { easy_to_use: '4' }, { 'Easy to use': 4 }, [4]]) {
      const { error } = await one.db.from('reviews').update({ features }).eq('product_id', productId).eq('user_id', one.id);
      expect(error?.code).toBe('23514');
    }
  });

  it('are served with the reviews and taken by POST', async () => {
    const [, two] = shoppers;
    const route = await import('@/app/api/v1/products/[id]/reviews/route');
    const token = (await two.db.auth.getSession()).data.session!.access_token;
    const headers = { authorization: `Bearer ${token}`, 'x-market': 'IN', 'content-type': 'application/json' };
    const posted = await route.POST(
      new NextRequest(`http://localhost/api/v1/products/${productId}/reviews`, { method: 'POST', headers, body: JSON.stringify({ ...review, features: { easy_to_use: 2, value_for_money: 5 } }) }),
      { params: Promise.resolve({ id: productId }) },
    );
    expect(posted.status).toBe(201);
    expect(((await posted.json()) as { review: { features: unknown } }).review.features).toEqual({ easy_to_use: 2, value_for_money: 5 });

    const got = await route.GET(new NextRequest(`http://localhost/api/v1/products/${productId}/reviews`, { headers }), { params: Promise.resolve({ id: productId }) });
    // one's were cleared and three's is hidden: under 3 ratings each
    expect(((await got.json()) as { features: unknown[] }).features).toEqual([]);

    const bad = await route.POST(
      new NextRequest(`http://localhost/api/v1/products/${productId}/reviews`, { method: 'POST', headers, body: JSON.stringify({ ...review, features: { easy_to_use: 9 } }) }),
      { params: Promise.resolve({ id: productId }) },
    );
    expect(bad.status).toBe(422);
  });
});
