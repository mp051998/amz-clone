import { json, preflight, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { sellerProfile } from '@/lib/data/seller-feedback';

/**
 * GET /api/v1/sellers?name= — a seller's public profile in this store: ratings by period, the
 * 12-month star breakdown and the latest comments, never who left them.
 */
export const GET = route(async (ctx) => {
  const name = (ctx.req.nextUrl.searchParams.get('name') ?? '').trim().slice(0, 120);
  if (!name) throw new DataError('invalid_input', 'name', 'Name the seller.');
  const seller = await sellerProfile(ctx.db, ctx.market, name);
  if (!seller) throw new DataError('not_found', 'seller', 'There’s no seller by that name in this store.');
  return json({ seller });
});

export const OPTIONS = preflight;
