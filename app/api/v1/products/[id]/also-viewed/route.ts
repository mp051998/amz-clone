import { json, preflight, route } from '@/lib/api/http';
import { alsoViewed } from '@/lib/data/also-viewed';
import { getProduct } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';

/**
 * GET /api/v1/products/:id/also-viewed — "Customers who viewed this item also viewed": up to 8 of
 * this store's products, most viewed with this one first.
 */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  const product = await getProduct(ctx.db, id, { includeArchived: true });
  if (!product || product.market !== ctx.market) throw new DataError('product_not_found');
  return json({ items: await alsoViewed(ctx.db, product) });
});

export const OPTIONS = preflight;
