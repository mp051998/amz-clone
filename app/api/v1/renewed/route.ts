import { json, preflight, route } from '@/lib/api/http';
import { listRenewed } from '@/lib/data/renewed';
import { MARKETS } from '@/lib/marketplace';
import { guaranteeDays } from '@/lib/renewed';

/**
 * GET /api/v1/renewed — the store's Renewed storefront: other sellers' renewed offers on sale and
 * in stock, each with its product, and the Renewed Guarantee's days (null: none in this store).
 */
export const GET = route(async (ctx) =>
  json({ renewed: await listRenewed(ctx.db, ctx.market), guaranteeDays: guaranteeDays(MARKETS[ctx.market]) }),
);

export const OPTIONS = preflight;
