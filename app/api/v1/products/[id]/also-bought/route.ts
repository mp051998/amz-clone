import { json, preflight, route } from '@/lib/api/http';
import { alsoBought } from '@/lib/data/also-bought';
import { getProduct } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';

/**
 * GET /api/v1/products/:id/also-bought — "Customers who bought this item also bought": up to 8 of
 * this store's products, most of this one's buyers first.
 */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  const product = await getProduct(ctx.db, id, { includeArchived: true });
  if (!product || product.market !== ctx.market) throw new DataError('product_not_found');
  return json({ items: await alsoBought(ctx.db, product) });
});

export const OPTIONS = preflight;
