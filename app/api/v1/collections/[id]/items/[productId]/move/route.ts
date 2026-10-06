import { body, noContent, preflight, requireUser, route } from '@/lib/api/http';
import { moveItem } from '@/lib/data/collections';
import { DataError } from '@/lib/data/errors';

/**
 * POST /api/v1/collections/:id/items/:productId/move { to } — move a product onto another of
 * your lists in the same store, keeping the price it was saved at.
 */
export const POST = route<{ id: string; productId: string }>(async (ctx, { id, productId }) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  if (typeof b.to !== 'string' || !b.to) throw new DataError('invalid_input', 'to');
  await moveItem(ctx.db, id, b.to, productId);
  return noContent();
});

export const OPTIONS = preflight;
