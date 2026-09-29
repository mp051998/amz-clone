import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { addItem } from '@/lib/data/collections';
import { DataError } from '@/lib/data/errors';

/**
 * POST /api/v1/collections/:id/items { productId } — save a product (idempotent;
 * the saved price is stamped by the database on first add).
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  if (typeof b.productId !== 'string' || !b.productId) throw new DataError('invalid_input', 'productId');
  const item = await addItem(ctx.db, id, b.productId);
  return json({ item }, { status: 201 });
});

export const OPTIONS = preflight;
