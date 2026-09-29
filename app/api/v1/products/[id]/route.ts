import { json, preflight, route } from '@/lib/api/http';
import { getProduct, getRatingSummary } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';

/** GET /api/v1/products/:id — product detail (with live stock) and its rating histogram. */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  const product = await getProduct(ctx.db, id);
  if (!product) throw new DataError('product_not_found');
  return json({ product, ratings: await getRatingSummary(ctx.db, id) });
});

export const OPTIONS = preflight;
