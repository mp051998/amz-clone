import { adminOnly } from '@/lib/api/admin';
import { body, json, noContent, preflight, route, type ApiContext } from '@/lib/api/http';
import { deleteProduct, getAdminProduct, setArchived, updateProduct } from '@/lib/data/admin-catalog';
import { DataError } from '@/lib/data/errors';

const EDITABLE = ['title', 'brand', 'category', 'image', 'priceMinor', 'listMinor', 'deal', 'badge', 'boughtPastMonth', 'seller', 'shipsFrom', 'bullets', 'description', 'details', 'stock'] as const;

async function load(ctx: ApiContext, id: string) {
  const product = await getAdminProduct(ctx.db, id);
  if (!product || product.market !== ctx.market) throw new DataError('product_not_found');
  return product;
}

/** GET /api/v1/admin/products/:id — every editable field (prices in minor units). */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  await adminOnly(ctx);
  return json({ product: await load(ctx, id) });
});

/**
 * PATCH /api/v1/admin/products/:id — change any editable fields (the rest keep their values);
 * `archived: true` takes it off sale, `false` puts it back.
 */
export const PATCH = route<{ id: string }>(async (ctx, { id }) => {
  await adminOnly(ctx);
  const current = await load(ctx, id);
  const patch = await body(ctx.req);
  if ('archived' in patch && typeof patch.archived !== 'boolean') {
    throw new DataError('invalid_input', 'archived', 'archived must be true or false');
  }
  if (EDITABLE.some((k) => k in patch)) {
    const next: Record<string, unknown> = {};
    for (const k of EDITABLE) next[k] = k in patch ? patch[k] : current[k];
    await updateProduct(ctx.db, id, next);
  }
  if (typeof patch.archived === 'boolean') await setArchived(ctx.db, id, patch.archived);
  return json({ product: await load(ctx, id) });
});

/** DELETE /api/v1/admin/products/:id — 204; `product_has_orders` (409) once it has been ordered (archive it instead). */
export const DELETE = route<{ id: string }>(async (ctx, { id }) => {
  await adminOnly(ctx);
  await load(ctx, id);
  await deleteProduct(ctx.db, id);
  return noContent();
});

export const OPTIONS = preflight;
