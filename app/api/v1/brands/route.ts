import { json, preflight, route } from '@/lib/api/http';
import { brandStore } from '@/lib/data/brands';
import { DataError } from '@/lib/data/errors';

/**
 * GET /api/v1/brands?name= — a brand's store in this market: its best sellers, its deals and its
 * products by department, as the storefront shows it at /stores/:brand.
 */
export const GET = route(async (ctx) => {
  const name = (ctx.req.nextUrl.searchParams.get('name') ?? '').trim().slice(0, 120);
  if (!name) throw new DataError('invalid_input', 'name', 'Name the brand.');
  const brand = await brandStore(ctx.db, ctx.market, name);
  if (!brand) throw new DataError('not_found', 'brand', 'Nothing from that brand is on sale in this store.');
  return json({ brand });
});

export const OPTIONS = preflight;
