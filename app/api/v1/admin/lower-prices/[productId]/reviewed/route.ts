import { adminOnly } from '@/lib/api/admin';
import { json, preflight, route } from '@/lib/api/http';
import { reviewPriceReports } from '@/lib/data/lower-price';

/** POST /api/v1/admin/lower-prices/:productId/reviewed — mark the product's open reports reviewed: `{reviewed}`, how many. */
export const POST = route<{ productId: string }>(async (ctx, { productId }) => {
  await adminOnly(ctx);
  return json({ reviewed: await reviewPriceReports(ctx.db, ctx.market, productId) });
});

export const OPTIONS = preflight;
