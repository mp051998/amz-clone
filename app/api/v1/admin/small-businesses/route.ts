import { adminOnly } from '@/lib/api/admin';
import { body, json, preflight, route } from '@/lib/api/http';
import { addSmallBusiness, listSmallBusinesses } from '@/lib/data/small-businesses';

/** GET /api/v1/admin/small-businesses — this store's small business brands, by name. */
export const GET = route(async (ctx) => {
  await adminOnly(ctx);
  return json({ smallBusinesses: await listSmallBusinesses(ctx.db, ctx.market) });
});

/**
 * POST /api/v1/admin/small-businesses { brand, story } — mark a brand this store sells as a small
 * business (its products get the badge); 201. `small_business_exists` (409) when it already is.
 */
export const POST = route(async (ctx) => {
  await adminOnly(ctx);
  const b = await body(ctx.req);
  const smallBusiness = await addSmallBusiness(ctx.db, ctx.market, { brand: b.brand, story: b.story });
  return json({ smallBusiness }, { status: 201 });
});

export const OPTIONS = preflight;
