import { json, preflight, requireUser, route } from '@/lib/api/http';
import { setDefaultAddress } from '@/lib/data/addresses';

/** POST /api/v1/addresses/:id/default — make this the store's default shipping address. */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  return json({ address: await setDefaultAddress(ctx.db, ctx.market, id) });
});

export const OPTIONS = preflight;
