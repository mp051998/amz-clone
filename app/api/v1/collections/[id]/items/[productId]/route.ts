import { noContent, preflight, requireUser, route } from '@/lib/api/http';
import { getCollection, isUuid, removeItem } from '@/lib/data/collections';
import { DataError } from '@/lib/data/errors';

/** DELETE /api/v1/collections/:id/items/:productId — remove a product (no-op when absent). */
export const DELETE = route<{ id: string; productId: string }>(async (ctx, { id, productId }) => {
  requireUser(ctx);
  if (!isUuid(id) || !(await getCollection(ctx.db, id))) throw new DataError('collection_not_found');
  await removeItem(ctx.db, id, productId);
  return noContent();
});

export const OPTIONS = preflight;
