import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addToCart } from '@/lib/data/cart';
import { getRatingSummary } from '@/lib/data/catalog';
import { placeOrder } from '@/lib/data/orders';
import { facetCount } from '@/components/product/reviewFilters';
import { deleteReview, listReviews, matchesReviewFilter, reportReview, reviewFacets, toggleHelpful, upsertReview } from '@/lib/data/reviews';
import { DataError } from '@/lib/data/errors';
import { admin, anon, deleteUser, deliveredDaysAgo, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('reviews', () => {
  let buyer: TestUser;
  let browser: TestUser;
  let productId: string;
  beforeAll(async () => {
    [buyer, browser] = await Promise.all([newUser('Verified Buyer'), newUser('Window Shopper')]);
    productId = (await pickProduct('US', 10)).id;
  });
  afterAll(async () => {
    await Promise.all([deleteUser(buyer), deleteUser(browser)]);
  });

  it('serves seeded reviews to anyone, most helpful first', async () => {
    const page = await listReviews(anon(), productId, null, { limit: 5 });
    expect(page.total).toBeGreaterThanOrEqual(8);
    const counts = page.items.map((r) => r.helpful);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('or newest first', async () => {
    const page = await listReviews(anon(), productId, null, { limit: 8, sort: 'recent' });
    const times = page.items.map((r) => Date.parse(r.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(page.total).toBe((await listReviews(anon(), productId, null, { limit: 1 })).total);
  });

  it('filters by stars and verified purchase across every review, counted by the facets', async () => {
    const facets = await reviewFacets(anon(), productId);
    expect(facetCount(facets, {})).toBe((await listReviews(anon(), productId, null, { limit: 1 })).total);
    for (const stars of [1, 2, 3, 4, 5, 'positive', 'critical'] as const) {
      const page = await listReviews(anon(), productId, null, { limit: 50, filter: { stars } });
      expect(page.total).toBe(facetCount(facets, { stars }));
      expect(page.items.every((r) => matchesReviewFilter(r, { stars }))).toBe(true);
    }
    const verified = await listReviews(anon(), productId, null, { limit: 50, filter: { stars: 'positive', verified: true } });
    expect(verified.total).toBe(facetCount(facets, { stars: 'positive', verified: true }));
    expect(verified.items.every((r) => r.verified && r.rating >= 4)).toBe(true);
    // a filter pages like the full list
    const first = await listReviews(anon(), productId, null, { limit: 2, filter: { stars: 'positive' } });
    const next = await listReviews(anon(), productId, null, { limit: 2, offset: 2, filter: { stars: 'positive' } });
    expect(next.items.map((r) => r.id).filter((id) => first.items.some((r) => r.id === id))).toEqual([]);
  });

  it('marks a review verified only once the author’s order has arrived', async () => {
    const unverified = await upsertReview(browser.db, productId, browser.id, { rating: 2, title: 'Looks fine', body: 'Have not bought it.' });
    expect(unverified.verified).toBe(false);

    await addToCart(buyer.db, 'US', productId, 1);
    const order = await placeOrder(buyer.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
    // ordered, delivery booked for later: not yet
    const early = await upsertReview(buyer.db, productId, buyer.id, { rating: 5, title: 'Great', body: 'Works as described.' });
    expect(early).toMatchObject({ verified: false, mine: true, author: 'Verified Buyer' });

    await deliveredDaysAgo(order.id);
    const verified = await upsertReview(buyer.db, productId, buyer.id, { rating: 5, title: 'Great', body: 'Works as described.' });
    expect(verified).toMatchObject({ verified: true, mine: true, author: 'Verified Buyer' });
  });

  it('one review per customer; editing replaces it and the rating rollup follows', async () => {
    const before = await getRatingSummary(anon(), productId);
    await upsertReview(buyer.db, productId, buyer.id, { rating: 1, title: 'Changed my mind', body: 'Broke after a week.' });
    const after = await getRatingSummary(anon(), productId);
    expect(after.count).toBe(before.count);
    expect(after.bars.find((b) => b.star === 1)!.count).toBe(before.bars.find((b) => b.star === 1)!.count + 1);
    expect(after.bars.find((b) => b.star === 5)!.count).toBe(before.bars.find((b) => b.star === 5)!.count - 1);

    const page = await listReviews(buyer.db, productId, buyer.id, { limit: 3 });
    expect(page.mine?.title).toBe('Changed my mind');
    expect(page.items[0].id).toBe(page.mine?.id); // pinned

    // pinned only where it belongs: a 1★ review is critical, not positive
    const critical = await listReviews(buyer.db, productId, buyer.id, { limit: 3, filter: { stars: 'critical' } });
    expect(critical.items[0].id).toBe(page.mine?.id);
    const positive = await listReviews(buyer.db, productId, buyer.id, { limit: 50, filter: { stars: 'positive' } });
    expect(positive.items.map((r) => r.id)).not.toContain(page.mine?.id);
    expect(positive.mine?.id).toBe(page.mine?.id);
    expect((await reviewFacets(anon(), productId))[1].verified).toBeGreaterThanOrEqual(1);
  });

  it('customers cannot forge the verified flag or helpful count', async () => {
    const { data: row } = await admin().from('reviews').select('id').eq('product_id', productId).eq('user_id', browser.id).single();
    await browser.db.from('reviews').update({ verified: true, helpful_count: 999 }).eq('id', row!.id);
    const { data } = await admin().from('reviews').select('verified, helpful_count').eq('id', row!.id).single();
    expect(data).toEqual({ verified: false, helpful_count: 0 });
  });

  it('helpful votes toggle, never on your own review; reports are idempotent', async () => {
    const page = await listReviews(browser.db, productId, browser.id, { limit: 20 });
    const theirs = page.items.find((r) => !r.mine)!;
    const on = await toggleHelpful(browser.db, theirs.id);
    expect(on).toMatchObject({ helpful: true, helpfulCount: theirs.helpful + 1 });
    const off = await toggleHelpful(browser.db, theirs.id);
    expect(off).toMatchObject({ helpful: false, helpfulCount: theirs.helpful });
    expect(await code(toggleHelpful(browser.db, page.mine!.id))).toBe('own_review');
    // guests can't even call it (EXECUTE is granted to signed-in users only)
    expect(await code(toggleHelpful(anon(), theirs.id))).toBe('forbidden');

    await reportReview(browser.db, theirs.id, 'spam');
    await reportReview(browser.db, theirs.id, 'spam');
    const again = await listReviews(browser.db, productId, browser.id, { limit: 20 });
    expect(again.items.find((r) => r.id === theirs.id)?.reported).toBe(true);
  });

  it('only the author can delete a review, and the rollup is restored', async () => {
    const before = await getRatingSummary(anon(), productId);
    const mine = (await listReviews(browser.db, productId, browser.id)).mine!;
    expect(await code(deleteReview(buyer.db, mine.id))).toBe('review_not_found');
    await deleteReview(browser.db, mine.id);
    const after = await getRatingSummary(anon(), productId);
    expect(after.count).toBe(before.count - 1);
  });
});
