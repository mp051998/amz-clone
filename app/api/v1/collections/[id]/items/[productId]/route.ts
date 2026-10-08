import { body, json, noContent, preflight, requireUser, route } from '@/lib/api/http';
import { getCollection, isUuid, removeItem, setItemDetails } from '@/lib/data/collections';
import { DataError } from '@/lib/data/errors';

/**
 * PATCH /api/v1/collections/:id/items/:productId { comment?, quantity?, priority? } — "Add
 * comment, quantity & priority". What's left out stays as it is.
 */
export const PATCH = route<{ id: string; productId: string }>(async (ctx, { id, productId }) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  const item = await setItemDetails(ctx.db, id, productId, { comment: b.comment, quantity: b.quantity, priority: b.priority });
  return json({ item });
});

/** DELETE /api/v1/collections/:id/items/:productId — remove a product (no-op when absent). */
export const DELETE = route<{ id: string; productId: string }>(async (ctx, { id, productId }) => {
  requireUser(ctx);
  if (!isUuid(id) || !(await getCollection(ctx.db, id))) throw new DataError('collection_not_found');
  await removeItem(ctx.db, id, productId);
  return noContent();
});

export const OPTIONS = preflight;
