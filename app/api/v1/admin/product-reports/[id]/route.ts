import { adminOnly } from '@/lib/api/admin';
import { body, json, preflight, route } from '@/lib/api/http';
import { assertStoreReport, resolveProductReport } from '@/lib/data/product-reports';

/** POST /api/v1/admin/product-reports/:id { status: resolved | dismissed, note? } — close an open report on this store's product. */
export const POST = route<{ id: string }>(async (ctx, { id }) => {
  await adminOnly(ctx);
  await assertStoreReport(ctx.db, ctx.market, id);
  const input = await body(ctx.req);
  return json({ report: await resolveProductReport(ctx.db, id, input.status, input.note) });
});

export const OPTIONS = preflight;
