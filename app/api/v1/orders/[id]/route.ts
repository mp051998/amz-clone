import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { archiveOrder, getOrder } from '@/lib/data/orders';

/** GET /api/v1/orders/:id — one of the caller's orders (any status). */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const order = await getOrder(ctx.db, id);
  if (!order) throw new DataError('order_not_found');
  return json({ order });
});

/** PATCH /api/v1/orders/:id { archived } — archive the order (out of the order list) or bring it back. */
export const PATCH = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const { archived } = await body(ctx.req);
  if (typeof archived !== 'boolean') throw new DataError('invalid_input', 'archived', 'archived must be true or false.');
  return json({ order: await archiveOrder(ctx.db, id, archived) });
});

export const OPTIONS = preflight;
