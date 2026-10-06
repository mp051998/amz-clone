import { json, preflight, route } from '@/lib/api/http';
import { getProduct, getProductInfo, getRatingSummary } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';

/** GET /api/v1/products/:id — product detail (with live stock, description and spec rows) and its rating histogram. */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  const product = await getProduct(ctx.db, id, { includeArchived: true });
  if (!product) throw new DataError('product_not_found');
  const [info, ratings] = await Promise.all([getProductInfo(ctx.db, id), getRatingSummary(ctx.db, id)]);
  return json({ product: { ...product, ...info }, ratings });
});

export const OPTIONS = preflight;
