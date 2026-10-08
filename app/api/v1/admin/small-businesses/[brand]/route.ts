import { adminOnly } from '@/lib/api/admin';
import { body, json, noContent, preflight, route } from '@/lib/api/http';
import { removeSmallBusiness, updateSmallBusiness } from '@/lib/data/small-businesses';

/** The brand in the path ("Tower%2028"), decoded unless it already is. */
function brandName(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** PATCH /api/v1/admin/small-businesses/:brand { story } — change what the brand's products say about it. */
export const PATCH = route<{ brand: string }>(async (ctx, { brand }) => {
  await adminOnly(ctx);
  const b = await body(ctx.req);
  return json({ smallBusiness: await updateSmallBusiness(ctx.db, ctx.market, brandName(brand), b.story) });
});

/** DELETE /api/v1/admin/small-businesses/:brand — stop marking it a small business; 204. */
export const DELETE = route<{ brand: string }>(async (ctx, { brand }) => {
  await adminOnly(ctx);
  await removeSmallBusiness(ctx.db, ctx.market, brandName(brand));
  return noContent();
});

export const OPTIONS = preflight;
