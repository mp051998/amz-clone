import { json, preflight, route } from '@/lib/api/http';
import { getProduct } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';
import { boughtTogether } from '@/lib/decision/server';

/**
 * GET /api/v1/products/:id/bought-together — up to two products to buy with this one:
 * pairs from placed orders (two shoppers or more), topped up with accessories.
 */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  const product = await getProduct(ctx.db, id, { includeArchived: true });
  if (!product || product.market !== ctx.market) throw new DataError('product_not_found');
  return json({ items: await boughtTogether(product, 2, ctx.db) });
});

export const OPTIONS = preflight;
