import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { getProduct } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';
import { rateProduct } from '@/lib/data/reviews';

/**
 * POST /api/v1/products/:id/rating { rating } — rate a product with stars alone (Your reviews →
 * "Rate it"): a new star-only rating, or new stars on the caller's review or rating, keeping
 * whatever they wrote.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  const user = requireUser(ctx);
  if (!(await getProduct(ctx.db, id, { includeArchived: true }))) throw new DataError('product_not_found');
  const { rating } = (await body(ctx.req)) as { rating?: unknown };
  return json({ review: await rateProduct(ctx.db, id, user.id, rating) });
});

export const OPTIONS = preflight;
