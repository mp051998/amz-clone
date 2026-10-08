import { adminOnly } from '@/lib/api/admin';
import { json, preflight, route } from '@/lib/api/http';
import { cancelLightningDeal, getAdminLightningDeal } from '@/lib/data/admin-lightning-deals';
import { DataError } from '@/lib/data/errors';

/**
 * POST /api/v1/admin/lightning-deals/:id/cancel — call off this store's deal: one not started yet
 * won't; a live one ends now and its product goes back to its own price. One already over stays
 * as it ended. Returns the deal.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  await adminOnly(ctx);
  if (!(await getAdminLightningDeal(ctx.db, ctx.market, id))) throw new DataError('not_found');
  await cancelLightningDeal(ctx.db, id);
  return json({ deal: await getAdminLightningDeal(ctx.db, ctx.market, id) });
});

export const OPTIONS = preflight;
