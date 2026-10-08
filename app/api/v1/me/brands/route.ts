import { body, json, noContent, preflight, requireUser, route } from '@/lib/api/http';
import { followBrand, followedBrandFeed, unfollowBrand } from '@/lib/data/brand-follows';

/**
 * GET /api/v1/me/brands — the brands the caller follows in this store, most recently followed
 * first, each with what's new from it (`products`, empty once nothing of it is on sale).
 */
export const GET = route(async (ctx) => {
  const user = requireUser(ctx);
  return json({ brands: await followedBrandFeed(ctx.db, ctx.market, user.id) });
});

/**
 * PUT /api/v1/me/brands { brand } — follow a brand in this store (again is fine). `{brand}` as the
 * catalog spells it; `404 not_found` (`brand`) when nothing of it is on sale here.
 */
export const PUT = route(async (ctx) => {
  requireUser(ctx);
  const b = await body(ctx.req);
  return json({ brand: await followBrand(ctx.db, ctx.market, b.brand) });
});

/** DELETE /api/v1/me/brands?brand= — stop following a brand in this store. */
export const DELETE = route(async (ctx) => {
  requireUser(ctx);
  await unfollowBrand(ctx.db, ctx.market, ctx.req.nextUrl.searchParams.get('brand'));
  return noContent();
});

export const OPTIONS = preflight;
