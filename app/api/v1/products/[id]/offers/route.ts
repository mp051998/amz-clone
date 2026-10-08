import { json, preflight, route } from '@/lib/api/http';
import { getProduct } from '@/lib/data/catalog';
import { DataError } from '@/lib/data/errors';
import { listOffers } from '@/lib/data/offers';

/**
 * GET /api/v1/products/:id/offers — other sellers' offers on a product (new, renewed and used),
 * cheapest first; only those in stock. An offer's id answers with its product's offers. A product
 * that's off sale has none.
 */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  const product = await getProduct(ctx.db, id, { includeArchived: true });
  if (!product || product.market !== ctx.market) throw new DataError('product_not_found');
  const parent = product.offerOf ? await getProduct(ctx.db, product.offerOf, { includeArchived: true }) : product;
  if (!parent || parent.archived) return json({ items: [] });
  return json({ items: await listOffers(ctx.db, parent.id) });
});

export const OPTIONS = preflight;
