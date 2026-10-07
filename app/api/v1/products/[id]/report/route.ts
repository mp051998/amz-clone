import { body, json, preflight, requireUser, route } from '@/lib/api/http';
import { reportProduct } from '@/lib/data/product-reports';

/**
 * POST /api/v1/products/:id/report { reason, details? } — report an issue with a product.
 * reason: wrong_info | pricing | counterfeit | safety | offensive | other; details up to 1000
 * characters (at least 10 for other). Reporting again while your report is open rewrites it:
 * 201 for a new report, 200 with `updated: true` for a rewrite.
 */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  requireUser(ctx);
  const input = await body(ctx.req);
  const { report, updated } = await reportProduct(ctx.db, id, { reason: input.reason, details: input.details });
  return json({ report, updated }, { status: updated ? 200 : 201 });
});

export const OPTIONS = preflight;
