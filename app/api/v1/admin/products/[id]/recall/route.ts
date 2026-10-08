import { adminOnly } from '@/lib/api/admin';
import { body, json, preflight, route } from '@/lib/api/http';
import { getAdminProduct } from '@/lib/data/admin-catalog';
import { DataError } from '@/lib/data/errors';
import { recallProduct } from '@/lib/data/recalls';

/**
 * POST /api/v1/admin/products/:id/recall { hazard, remedy } — recall this store's product (10–500
 * characters each): takes it off sale for good. Recalling it again rewrites the text (`updated`).
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  await adminOnly(ctx);
  const product = await getAdminProduct(ctx.db, id);
  if (!product || product.market !== ctx.market) throw new DataError('product_not_found');
  const input = await body(ctx.req);
  const { recall, updated } = await recallProduct(ctx.db, id, { hazard: input.hazard, remedy: input.remedy });
  return json({ recall, updated }, { status: updated ? 200 : 201 });
});

export const OPTIONS = preflight;
