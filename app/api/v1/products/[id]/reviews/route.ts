import { body, intParam, json, preflight, requireUser, route } from '@/lib/api/http';
import { getProduct } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';
import { listReviews, upsertReview } from '@/lib/data/reviews';

/** GET /api/v1/products/:id/reviews?limit=10&offset=0 — most helpful first; the caller's own review pinned. */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  const sp = ctx.req.nextUrl.searchParams;
  const page = await listReviews(ctx.db, id, ctx.user?.id ?? null, {
    limit: intParam(sp.get('limit'), 10, 1, 50),
    offset: intParam(sp.get('offset'), 0, 0, 100_000),
  });
  return json(page);
});

/**
 * POST /api/v1/products/:id/reviews { rating, title, body, authorName? }
 * Create or replace the caller's review (one per customer). "Verified Purchase"
 * is decided by the database from the caller's placed orders.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  const user = requireUser(ctx);
  if (!(await getProduct(ctx.db, id))) throw new DataError('product_not_found');
  const review = await upsertReview(ctx.db, id, user.id, await body(ctx.req));
  return json({ review }, { status: 201 });
});

export const OPTIONS = preflight;
