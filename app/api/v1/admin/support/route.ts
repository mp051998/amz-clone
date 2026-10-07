import { adminOnly } from '@/lib/api/admin';
import { intParam, json, preflight, route } from '@/lib/api/http';
import { caseView, listCaseQueue } from '@/lib/data/support';

/**
 * GET /api/v1/admin/support?view=&page= — this store's support cases with each one's latest
 * message. view: waiting (the default, longest waiting first) | answered | closed (latest first).
 * `counts` has every view's total.
 */
export const GET = route(async (ctx) => {
  await adminOnly(ctx);
  const p = ctx.req.nextUrl.searchParams;
  return json(await listCaseQueue(ctx.db, ctx.market, { view: caseView(p.get('view')), page: intParam(p.get('page'), 1, 1, 10_000) }));
});

export const OPTIONS = preflight;
