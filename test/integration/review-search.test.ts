import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listReviews, upsertReview } from '@/lib/data/reviews';
import { admin, anon, deleteUser, newUser, pickProduct, type TestUser } from './helpers';

describe('searching customer reviews', () => {
  let a: TestUser;
  let b: TestUser;
  let productId: string;
  beforeAll(async () => {
    [a, b] = await Promise.all([newUser('Search Reviewer A'), newUser('Search Reviewer B')]);
    productId = (await pickProduct('US', 63)).id;
  });
  afterAll(async () => {
    await admin().from('reviews').delete().eq('product_id', productId).in('user_id', [a.id, b.id]);
    await Promise.all([a, b].map(deleteUser));
  });

  it('finds reviews whose headline or text contains the words, alongside the other filters', async () => {
    const zip = await upsertReview(a.db, productId, a.id, { rating: 2, title: 'Zipper snagged', body: 'Snug, warm (mostly) — but 100% annoying.' });
    const fit = await upsertReview(b.db, productId, b.id, { rating: 5, title: 'Fits well', body: 'Rated 1000 out of 10. The ZIPPER is smooth.' });
    const ids = async (q: string, filter = {}) =>
      (await listReviews(anon(), productId, null, { limit: 50, filter: { ...filter, q } })).items.map((r) => r.id);

    // case-insensitive, in the headline or the text
    expect(await ids('zipper')).toEqual(expect.arrayContaining([zip.id, fit.id]));
    // the other filters still apply
    const critical = await ids('zipper', { stars: 'critical' });
    expect(critical).toContain(zip.id);
    expect(critical).not.toContain(fit.id);
    // % and _ are literal, and commas / parentheses don't break the query
    const percent = await ids('100%');
    expect(percent).toContain(zip.id);
    expect(percent).not.toContain(fit.id);
    expect(await ids('snug, warm (mostly)')).toContain(zip.id);
    expect(await ids('1_00')).not.toContain(fit.id);

    const page = await listReviews(anon(), productId, null, { limit: 50, filter: { q: 'fits well' } });
    expect(page.items.map((r) => r.id)).toContain(fit.id);
    expect(page.total).toBe(page.items.length);
  });
});
