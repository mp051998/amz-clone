import { body, intParam, json, preflight, requireUser, route } from '@/lib/api/http';
import { getProduct } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';
import { customerImages } from '@/lib/data/review-photos';
import { listReviews, readReviewFilter, readReviewSort, reviewFeatureRows, reviewFitCounts, upsertReview } from '@/lib/data/reviews';
import { featureRatings } from '@/lib/review-features';
import { fitSummary } from '@/lib/review-fit';

/**
 * GET /api/v1/products/:id/reviews?limit=10&offset=0&sort=top|recent&stars=&verified=&photos=&q= — written
 * reviews (star-only ratings count toward the stars but aren't listed), most helpful
 * (or newest) first; the caller's own review pinned, and `mine` their review or rating. stars: 1–5, positive (4–5★) or critical
 * (1–3★); verified=1 keeps verified purchases, photos=1 reviews with photos, q= ones
 * whose headline or text contains it (2–100 characters). `total` counts the filtered reviews. `images`: the
 * newest photos from its reviews. `fit`: how its reviews say it fits (clothing and shoes), null with
 * fewer than 3 answers. `features`: "By feature", each feature's average stars once 3 have rated it.
 */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  const sp = ctx.req.nextUrl.searchParams;
  const [page, images, fit, features] = await Promise.all([
    listReviews(ctx.db, id, ctx.user?.id ?? null, {
      limit: intParam(sp.get('limit'), 10, 1, 50),
      offset: intParam(sp.get('offset'), 0, 0, 100_000),
      sort: readReviewSort(sp.get('sort')),
      filter: readReviewFilter(sp.get('stars'), sp.get('verified'), sp.get('photos'), sp.get('q')),
    }),
    customerImages(ctx.db, id),
    reviewFitCounts(ctx.db, id).then(fitSummary),
    reviewFeatureRows(ctx.db, id).then((rows) => featureRatings(rows)),
  ]);
  return json({ ...page, images, fit, features });
});

/**
 * POST /api/v1/products/:id/reviews { rating, title, body, authorName?, photos?, fit?, features? }
 * Create or replace the caller's review (one per customer); with no title and no body, a
 * star-only rating. "Verified Purchase"
 * is decided by the database: the caller has a delivered order containing it.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  const user = requireUser(ctx);
  if (!(await getProduct(ctx.db, id, { includeArchived: true }))) throw new DataError('product_not_found');
  const review = await upsertReview(ctx.db, id, user.id, await body(ctx.req));
  return json({ review }, { status: 201 });
});

export const OPTIONS = preflight;
