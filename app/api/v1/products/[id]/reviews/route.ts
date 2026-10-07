import { body, intParam, json, preflight, requireUser, route } from '@/lib/api/http';
import { getProduct } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';
import { customerImages } from '@/lib/data/review-photos';
import { listReviews, readReviewFilter, readReviewSort, upsertReview } from '@/lib/data/reviews';

/**
 * GET /api/v1/products/:id/reviews?limit=10&offset=0&sort=top|recent&stars=&verified= — most helpful
 * (or newest) first; the caller's own review pinned. stars: 1–5, positive (4–5★) or critical
 * (1–3★); verified=1 keeps verified purchases. `total` counts the filtered reviews. `images`: the
 * newest photos from its reviews.
 */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  const sp = ctx.req.nextUrl.searchParams;
  const [page, images] = await Promise.all([
    listReviews(ctx.db, id, ctx.user?.id ?? null, {
      limit: intParam(sp.get('limit'), 10, 1, 50),
      offset: intParam(sp.get('offset'), 0, 0, 100_000),
      sort: readReviewSort(sp.get('sort')),
      filter: readReviewFilter(sp.get('stars'), sp.get('verified')),
    }),
    customerImages(ctx.db, id),
  ]);
  return json({ ...page, images });
});

/**
 * POST /api/v1/products/:id/reviews { rating, title, body, authorName?, photos? }
 * Create or replace the caller's review (one per customer). "Verified Purchase"
 * is decided by the database: the caller has a delivered order containing it.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  const user = requireUser(ctx);
  if (!(await getProduct(ctx.db, id, { includeArchived: true }))) throw new DataError('product_not_found');
  const review = await upsertReview(ctx.db, id, user.id, await body(ctx.req));
  return json({ review }, { status: 201 });
});

export const OPTIONS = preflight;
