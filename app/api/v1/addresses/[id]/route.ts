import { body, json, noContent, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { deleteAddress, getAddress, updateAddress } from '@/lib/data/addresses';

export const GET = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const address = await getAddress(ctx.db, ctx.market, id);
  if (!address) throw new DataError('address_not_found');
  return json({ address });
});

/** PATCH /api/v1/addresses/:id — replace the address fields (same shape as POST). */
export const PATCH = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  return json({ address: await updateAddress(ctx.db, ctx.market, id, b, b.makeDefault === true) });
});

/** DELETE /api/v1/addresses/:id — removing the default promotes the next oldest. */
export const DELETE = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  await deleteAddress(ctx.db, ctx.market, id);
  return noContent();
});

export const OPTIONS = preflight;
