import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { archiveOrder, getOrder, setOrderInstructions } from '@/lib/data/orders';

/** GET /api/v1/orders/:id — one of the caller's orders (any status). */
export const GET = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const order = await getOrder(ctx.db, id);
  if (!order) throw new DataError('order_not_found');
  return json({ order });
});

/**
 * PATCH /api/v1/orders/:id { archived?, instructions? } — archive the order (out of the order
 * list) or bring it back; change its delivery instructions until it's out for delivery
 * (`""` or null removes them). Instructions apply first.
 */
export const PATCH = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const { archived, instructions } = await body(ctx.req);
  if (archived === undefined && instructions === undefined) throw new DataError('invalid_input', undefined, 'Send archived or instructions.');
  if (archived !== undefined && typeof archived !== 'boolean') throw new DataError('invalid_input', 'archived', 'archived must be true or false.');
  if (instructions !== undefined && instructions !== null && typeof instructions !== 'string') {
    throw new DataError('invalid_input', 'instructions', 'instructions must be a string or null.');
  }
  let order = instructions !== undefined ? await setOrderInstructions(ctx.db, id, instructions ?? '') : null;
  if (typeof archived === 'boolean') order = await archiveOrder(ctx.db, id, archived);
  return json({ order });
});

export const OPTIONS = preflight;
